import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as tasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export function createDeletionResources(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    media: s3.IBucket;
    logGroup: logs.ILogGroup;
  },
) {
  const secret = new secretsmanager.Secret(scope, 'DeletionConfirmationSecret', {
    generateSecretString: { passwordLength: 48, excludePunctuation: true },
  });
  const common = {
    runtime: lambda.Runtime.NODEJS_24_X,
    bundling: { minify: true, sourceMap: true },
    logGroup: options.logGroup,
  } as const;
  const worker = new nodejs.NodejsFunction(scope, 'DeletionWorkflowFunction', {
    ...common,
    entry: fileURLToPath(
      new URL('../../apps/api/src/deletion/workflow-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    timeout: Duration.minutes(10),
    memorySize: 512,
    environment: {
      ...options.environment,
      NAASEH_ATTACHMENT_BUCKET: options.media.bucketName,
    },
  });
  const invoke = new tasks.LambdaInvoke(scope, 'RunCheckpointedDeletion', {
    lambdaFunction: worker,
    payloadResponseOnly: true,
    retryOnServiceExceptions: true,
  });
  const stateMachine = new sfn.StateMachine(scope, 'PermanentDeletionStateMachine', {
    definitionBody: sfn.DefinitionBody.fromChainable(invoke),
    timeout: Duration.minutes(15),
    tracingEnabled: true,
    logs: {
      destination: new logs.LogGroup(scope, 'PermanentDeletionWorkflowLogs', {
        retention: logs.RetentionDays.THREE_MONTHS,
        removalPolicy: RemovalPolicy.RETAIN,
      }),
      level: sfn.LogLevel.ERROR,
      includeExecutionData: false,
    },
  });
  const apiHandler = new nodejs.NodejsFunction(scope, 'DeletionApiFunction', {
    ...common,
    entry: fileURLToPath(new URL('../../apps/api/src/deletion/handlers.ts', import.meta.url)),
    handler: 'handler',
    timeout: Duration.seconds(30),
    memorySize: 512,
    environment: {
      ...options.environment,
      DELETION_CONFIRMATION_SECRET_ID: secret.secretArn,
      DELETION_STATE_MACHINE_ARN: stateMachine.stateMachineArn,
    },
  });
  options.table.grantReadWriteData(worker);
  options.table.grantReadWriteData(apiHandler);
  options.media.grantDelete(worker, 'attachments/*');
  secret.grantRead(apiHandler);
  stateMachine.grantStartExecution(apiHandler);
  new cloudwatch.Alarm(scope, 'PermanentDeletionFailureAlarm', {
    metric: stateMachine.metricFailed({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  new cloudwatch.Alarm(scope, 'PermanentDeletionWorkerErrorAlarm', {
    metric: worker.metricErrors({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  return { apiHandler, worker, stateMachine, secret };
}
