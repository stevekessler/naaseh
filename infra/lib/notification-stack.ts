import { ArnFormat, Duration, Stack } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export const notificationControls = {
  eventBridgeScheduler: true,
  genericPayloads: true,
  expiredSubscriptionCleanup: true,
  deliveryFailureMetrics: true,
} as const;

export function createNotificationResources(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    webPushSecret: secretsmanager.ISecret;
    taskFunction: nodejs.NodejsFunction;
    logGroup: logs.ILogGroup;
  },
) {
  const fn = new nodejs.NodejsFunction(scope, 'NotificationFunction', {
    entry: fileURLToPath(new URL('../../apps/api/src/notifications/handler.ts', import.meta.url)),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.seconds(15),
    memorySize: 512,
    reservedConcurrentExecutions: 5,
    logGroup: options.logGroup,
    environment: options.environment,
    bundling: { minify: true, sourceMap: true },
  });
  options.table.grantReadWriteData(fn);
  options.webPushSecret.grantRead(fn);
  const schedulerRole = new iam.Role(scope, 'NotificationSchedulerRole', {
    assumedBy: new iam.ServicePrincipal('scheduler.amazonaws.com'),
  });
  fn.grantInvoke(schedulerRole);
  options.taskFunction.addEnvironment('NOTIFICATION_TARGET_ARN', fn.functionArn);
  options.taskFunction.addEnvironment('NOTIFICATION_SCHEDULER_ROLE_ARN', schedulerRole.roleArn);
  options.taskFunction.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['scheduler:CreateSchedule', 'scheduler:UpdateSchedule', 'scheduler:DeleteSchedule'],
      resources: [
        Stack.of(scope).formatArn({
          service: 'scheduler',
          resource: 'schedule',
          resourceName: 'default/naaseh-reminder-*',
          arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
        }),
      ],
    }),
  );
  options.taskFunction.addToRolePolicy(
    new iam.PolicyStatement({ actions: ['iam:PassRole'], resources: [schedulerRole.roleArn] }),
  );
  return { fn, schedulerRole };
}
