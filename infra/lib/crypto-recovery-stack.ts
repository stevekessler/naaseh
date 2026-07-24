import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import type { Construct } from 'constructs';
import { fileURLToPath } from 'node:url';

export const cryptoRecoveryControls = {
  isolatedRole: true,
  reservedConcurrency: 1,
  ownerPasswordReverification: true,
  auditAlarm: true,
} as const;

/** Creates the only runtime principal permitted to decrypt hidden-memo recovery wraps. */
export function createCryptoRecoveryFunction(
  scope: Construct,
  options: {
    environment: Record<string, string>;
    table: dynamodb.ITable;
    pepper: secretsmanager.ISecret;
    recoveryKeyArn: string;
  },
) {
  const logGroup = new logs.LogGroup(scope, 'CryptoRecoveryLogs', {
    retention: logs.RetentionDays.THREE_MONTHS,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const fn = new nodejs.NodejsFunction(scope, 'CryptoRecoveryFunction', {
    entry: fileURLToPath(new URL('../../apps/api/src/crypto-recovery/handler.ts', import.meta.url)),
    handler: 'handler',
    runtime: lambda.Runtime.NODEJS_24_X,
    timeout: Duration.seconds(15),
    memorySize: 1024,
    reservedConcurrentExecutions: 1,
    logGroup,
    environment: {
      ...options.environment,
      RECOVERY_KMS_KEY_ARN: options.recoveryKeyArn,
    },
    bundling: { minify: true, sourceMap: true, nodeModules: ['@node-rs/argon2'] },
  });
  options.table.grantReadWriteData(fn);
  options.pepper.grantRead(fn);
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      actions: ['kms:Decrypt'],
      resources: [options.recoveryKeyArn],
    }),
  );
  fn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.DENY,
      actions: ['kms:ScheduleKeyDeletion', 'kms:DisableKey', 'secretsmanager:DeleteSecret'],
      resources: ['*'],
    }),
  );
  const alarm = new cloudwatch.Alarm(scope, 'CryptoRecoveryErrors', {
    metric: fn.metricErrors({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
  });
  return { fn, logGroup, alarm };
}
