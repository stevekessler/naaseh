import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';
export function createExportResources(scope: Construct, options: { table: dynamodb.ITable }) {
  const key = new kms.Key(scope, 'ExportKey', {
    enableKeyRotation: true,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const bucket = new s3.Bucket(scope, 'ExportBucket', {
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
    encryption: s3.BucketEncryption.KMS,
    encryptionKey: key,
    bucketKeyEnabled: true,
    versioned: true,
    removalPolicy: RemovalPolicy.RETAIN,
    lifecycleRules: [
      {
        id: 'ExpireExportData',
        expiration: Duration.days(1),
        noncurrentVersionExpiration: Duration.days(1),
        abortIncompleteMultipartUploadAfter: Duration.days(1),
      },
    ],
  });
  const worker = new nodejs.NodejsFunction(scope, 'ExportWorkflowFunction', {
    runtime: lambda.Runtime.NODEJS_24_X,
    entry: fileURLToPath(
      new URL('../../apps/api/src/exports/workflow-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    timeout: Duration.minutes(15),
    memorySize: 1024,
    bundling: { minify: true, sourceMap: true },
    environment: {
      NAASEH_TABLE: options.table.tableName,
      NAASEH_EXPORT_BUCKET: bucket.bucketName,
      NAASEH_EXPORT_KMS_KEY_ARN: key.keyArn,
    },
  });
  options.table.grantReadWriteData(worker);
  bucket.grantReadWrite(worker);
  key.grantEncryptDecrypt(worker);
  const exportTask = new tasks.CallAwsService(scope, 'CreateExactTaskSnapshot', {
    service: 'dynamodb',
    action: 'exportTableToPointInTime',
    parameters: {
      TableArn: options.table.tableArn,
      S3Bucket: bucket.bucketName,
      S3Prefix: sfn.JsonPath.format('raw/{}', sfn.JsonPath.stringAt('$.jobId')),
      S3SseAlgorithm: 'KMS',
      S3SseKmsKeyId: key.keyArn,
      ExportFormat: 'DYNAMODB_JSON',
      ExportTime: sfn.JsonPath.numberAt('$.snapshotEpochSeconds'),
    },
    iamResources: [options.table.tableArn],
    resultPath: '$.export',
  });
  const wait = new sfn.Wait(scope, 'WaitForSnapshot', {
    time: sfn.WaitTime.duration(Duration.seconds(30)),
  });
  const describe = new tasks.CallAwsService(scope, 'DescribeTaskSnapshot', {
    service: 'dynamodb',
    action: 'describeExport',
    parameters: { ExportArn: sfn.JsonPath.stringAt('$.export.ExportDescription.ExportArn') },
    iamResources: ['*'],
    resultPath: '$.description',
  });
  const transform = new tasks.LambdaInvoke(scope, 'TransformVerifiedCsv', {
    lambdaFunction: worker,
    payload: sfn.TaskInput.fromObject({
      jobId: sfn.JsonPath.stringAt('$.jobId'),
      exportPrefix: sfn.JsonPath.format('raw/{}', sfn.JsonPath.stringAt('$.jobId')),
      action: 'transform',
    }),
    outputPath: '$.Payload',
  });
  const retainResult = new sfn.Wait(scope, 'RetainResultUnderTwentyFourHours', {
    time: sfn.WaitTime.duration(Duration.hours(20)),
  });
  const expireResult = new tasks.LambdaInvoke(scope, 'ExpireUnacknowledgedResult', {
    lambdaFunction: worker,
    payload: sfn.TaskInput.fromObject({
      jobId: sfn.JsonPath.stringAt('$.jobId'),
      action: 'expire',
    }),
    outputPath: '$.Payload',
  });
  transform.next(retainResult).next(expireResult);
  const failed = new sfn.Fail(scope, 'SnapshotFailed', {
    cause: 'DynamoDB snapshot export failed',
  });
  const choice = new sfn.Choice(scope, 'SnapshotReady')
    .when(
      sfn.Condition.stringEquals('$.description.ExportDescription.ExportStatus', 'COMPLETED'),
      transform,
    )
    .when(
      sfn.Condition.stringEquals('$.description.ExportDescription.ExportStatus', 'FAILED'),
      failed,
    )
    .otherwise(wait);
  wait.next(describe).next(choice);
  exportTask.next(wait);
  const logGroup = new logs.LogGroup(scope, 'ExportWorkflowLogs', {
    retention: logs.RetentionDays.THREE_MONTHS,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const stateMachine = new sfn.StateMachine(scope, 'ExportWorkflow', {
    definitionBody: sfn.DefinitionBody.fromChainable(exportTask),
    logs: { destination: logGroup, level: sfn.LogLevel.ERROR },
    tracingEnabled: true,
    timeout: Duration.hours(23),
  });
  bucket.grantReadWrite(stateMachine.role);
  key.grantEncryptDecrypt(stateMachine.role);
  return { bucket, key, stateMachine, worker };
}
export function createExportOperatorPolicy(scope: Construct, coordinator: lambda.IFunction) {
  return new iam.ManagedPolicy(scope, 'ExportOperatorPolicy', {
    statements: [
      new iam.PolicyStatement({
        actions: ['lambda:InvokeFunction'],
        resources: [coordinator.functionArn],
      }),
    ],
  });
}
