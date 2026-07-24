#!/usr/bin/env python3
"""Download a verified, point-in-time Na'aseh to-do CSV through an IAM Lambda command."""
import argparse,csv,hashlib,json,os,sys,tempfile,time,urllib.request,uuid
import boto3
from botocore.exceptions import BotoCoreError,ClientError
EXIT_OK=0;EXIT_USAGE=2;EXIT_DENIED=3;EXIT_SERVICE=4;EXIT_VERIFY=5;REGION='us-west-2'
def parser():
    value=argparse.ArgumentParser(description="Export all Na'aseh to-do items to CSV.")
    value.add_argument('--output',required=True);value.add_argument('--region',choices=(REGION,),default=REGION);value.add_argument('--function-name',default=os.getenv('NAASEH_EXPORT_TODOS_FUNCTION'));value.add_argument('--profile');value.add_argument('--overwrite',action='store_true');value.add_argument('--poll-seconds',type=float,default=2.0);return value
def invoke(client,function,payload):
    response=client.invoke(FunctionName=function,InvocationType='RequestResponse',Payload=json.dumps(payload).encode());return json.loads(response['Payload'].read())
def main(argv=None):
    args=parser().parse_args(argv);destination=os.path.abspath(args.output)
    if not args.function_name or (os.path.exists(destination) and not args.overwrite):print('A function name and an available output path are required.',file=sys.stderr);return EXIT_USAGE
    job_id=str(uuid.uuid4());principal='iam-operator'
    try:
        client=boto3.Session(region_name=args.region,profile_name=args.profile).client('lambda');response=invoke(client,args.function_name,{'version':'naaseh.export-todos/v1','action':'start','idempotencyKey':job_id,'principalId':principal})
        if 'error' in response:return EXIT_DENIED if response['error'].get('code') in ('forbidden','unauthorized') else EXIT_SERVICE
        job=response['job']
        while job['status'] not in ('ready','failed','expired'):
            time.sleep(max(.1,args.poll_seconds));response=invoke(client,args.function_name,{'version':'naaseh.export-todos/v1','action':'status','jobId':job['id'],'principalId':principal});job=response['job']
        if job['status']!='ready':return EXIT_SERVICE
        result=response['result'];directory=os.path.dirname(destination);os.makedirs(directory,exist_ok=True);fd,temp_path=tempfile.mkstemp(prefix='.naaseh-export-',dir=directory);os.fchmod(fd,0o600)
        try:
            digest=hashlib.sha256();length=0
            with os.fdopen(fd,'wb') as output,urllib.request.urlopen(result['downloadUrl'],timeout=60) as source:
                while chunk:=source.read(1024*1024):output.write(chunk);digest.update(chunk);length+=len(chunk)
                output.flush();os.fsync(output.fileno())
            manifest=result['manifest']
            with open(temp_path,newline='',encoding='utf-8') as stream:rows=sum(1 for _ in csv.reader(stream))-1
            if length!=manifest['byteLength'] or digest.hexdigest()!=manifest['sha256'] or rows!=manifest['rowCount']:raise ValueError('verification mismatch')
            os.replace(temp_path,destination);dir_fd=os.open(directory,os.O_RDONLY)
            try:os.fsync(dir_fd)
            finally:os.close(dir_fd)
            invoke(client,args.function_name,{'version':'naaseh.export-todos/v1','action':'acknowledge','jobId':job['id'],'principalId':principal});print(f'Export verified: {destination} ({rows} rows).');return EXIT_OK
        finally:
            if os.path.exists(temp_path):os.unlink(temp_path)
    except (BotoCoreError,ClientError,KeyError,TypeError,ValueError,json.JSONDecodeError,OSError) as error:
        print('Export could not be completed or verified.',file=sys.stderr);return EXIT_VERIFY if isinstance(error,ValueError) else EXIT_SERVICE
if __name__=='__main__':raise SystemExit(main())
