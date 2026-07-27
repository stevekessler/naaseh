import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as eventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export const googleSyncControls = {
  scheduleMinutes: 5,
  reconcilerConcurrency: 3,
  streamConcurrency: 2,
  logRetentionDays: 30,
} as const;

export function createGoogleSyncResources(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    allowedOrigin: string;
    table: dynamodb.Table;
    dataKey: kms.IKey;
    oauthSecret: secretsmanager.ISecret;
  },
) {
  const logGroup = new logs.LogGroup(scope, 'GoogleSyncLogs', {
    retention: logs.RetentionDays.ONE_MONTH,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const environment = {
    ...options.environment,
    ALLOWED_ORIGINS: options.allowedOrigin,
    GOOGLE_OAUTH_SECRET_ID: options.oauthSecret.secretArn,
    NAASEH_DATA_KMS_KEY_ARN: options.dataKey.keyArn,
  };
  const api = new nodejs.NodejsFunction(scope, 'GoogleSyncFunction', {
    entry: fileURLToPath(new URL('../../apps/api/src/google-sync/handler.ts', import.meta.url)),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    memorySize: 512,
    timeout: Duration.minutes(10),
    reservedConcurrentExecutions: googleSyncControls.reconcilerConcurrency,
    environment,
    logGroup,
    bundling: { minify: true, sourceMap: true },
  });
  const stream = new nodejs.NodejsFunction(scope, 'GoogleSyncStreamFunction', {
    entry: fileURLToPath(
      new URL('../../apps/api/src/google-sync/stream-handler.ts', import.meta.url),
    ),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    memorySize: 256,
    timeout: Duration.seconds(30),
    reservedConcurrentExecutions: googleSyncControls.streamConcurrency,
    environment: options.environment,
    logGroup,
    bundling: { minify: true, sourceMap: true },
  });
  options.table.grantReadWriteData(api);
  options.table.grantStreamRead(api);
  options.table.grantReadWriteData(stream);
  options.table.grantStreamRead(stream);
  options.dataKey.grantEncryptDecrypt(api);
  options.oauthSecret.grantRead(api);
  for (const fn of [api, stream])
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        actions: ['kms:ScheduleKeyDeletion', 'secretsmanager:DeleteSecret'],
        resources: ['*'],
      }),
    );
  stream.addEventSource(
    new eventSources.DynamoEventSource(options.table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 25,
      bisectBatchOnError: true,
      retryAttempts: 5,
      parallelizationFactor: 1,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: lambda.FilterRule.or('INSERT', 'MODIFY'),
          dynamodb: { Keys: { SK: { S: ['CURRENT'] } } },
        }),
      ],
    }),
  );
  api.addEventSource(
    new eventSources.DynamoEventSource(options.table, {
      startingPosition: lambda.StartingPosition.LATEST,
      batchSize: 1,
      bisectBatchOnError: true,
      retryAttempts: 2,
      parallelizationFactor: 1,
      filters: [
        lambda.FilterCriteria.filter({
          eventName: ['INSERT'],
          dynamodb: {
            NewImage: {
              SK: { S: [{ prefix: 'RUN#' }] },
              data: { M: { state: { S: ['queued'] } } },
            },
          },
        }),
      ],
    }),
  );
  new events.Rule(scope, 'GoogleSyncSchedule', {
    schedule: events.Schedule.rate(Duration.minutes(googleSyncControls.scheduleMinutes)),
    targets: [new targets.LambdaFunction(api)],
  });
  const metric = (name: string, statistic = 'Sum') =>
    new cloudwatch.Metric({
      namespace: 'Naaseh',
      metricName: name,
      statistic,
      period: Duration.minutes(5),
    });
  for (const [id, name, threshold, evaluations] of [
    ['GoogleSyncAuthorizationFailureAlarm', 'GoogleSyncAuthorizationFailures', 1, 1],
    ['GoogleSyncRevocationAlarm', 'GoogleSyncRevocations', 1, 1],
    ['GoogleSyncThrottleAlarm', 'GoogleSyncThrottles', 5, 1],
    ['GoogleSyncRunFailureAlarm', 'GoogleSyncRunFailures', 1, 1],
    ['GoogleSyncCheckpointStallAlarm', 'GoogleSyncCheckpointStalls', 1, 2],
    ['GoogleSyncConflictGrowthAlarm', 'GoogleSyncConflicts', 10, 1],
    ['GoogleSyncQuarantineGrowthAlarm', 'GoogleSyncQuarantines', 5, 1],
  ] as const)
    new cloudwatch.Alarm(scope, id, {
      metric: metric(name),
      threshold,
      evaluationPeriods: evaluations,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  new cloudwatch.Alarm(scope, 'GoogleSyncLagAlarm', {
    metric: metric('GoogleSyncLagSeconds', 'Maximum'),
    threshold: 600,
    evaluationPeriods: 2,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  return { api, stream, logGroup };
}
