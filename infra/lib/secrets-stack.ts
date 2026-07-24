import { Duration, RemovalPolicy, Tags } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';

export const secretControls = {
  region: 'us-west-2',
  replicated: false,
  customerManagedEncryption: true,
  rotationReviewDays: 90,
} as const;

export function createRuntimeSecrets(scope: Construct) {
  const primaryKey = new kms.Key(scope, 'RuntimeSecretsKey', {
    alias: 'alias/naaseh-runtime-secrets',
    enableKeyRotation: true,
    multiRegion: false,
    removalPolicy: RemovalPolicy.RETAIN,
    pendingWindow: Duration.days(30),
  });
  const pepper = new secretsmanager.Secret(scope, 'PasswordPepper', {
    description: 'Versioned password pepper; never exposed to browsers.',
    encryptionKey: primaryKey,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const webPushSecret = new secretsmanager.Secret(scope, 'WebPushCredentials', {
    description: 'Versioned VAPID keys and subject for generic Web Push reminders.',
    encryptionKey: primaryKey,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  for (const [secret, owner] of [
    [pepper, 'authentication'],
    [webPushSecret, 'notifications'],
  ] as const) {
    Tags.of(secret).add('NaasehRotationOwner', owner);
    Tags.of(secret).add('NaasehRotationReviewDays', String(secretControls.rotationReviewDays));
    Tags.of(secret).add('NaasehRecoveryRequired', 'true');
  }
  const alerts = new sns.Topic(scope, 'RuntimeSecretSecurityAlerts');
  const policyChangeRule = new events.Rule(scope, 'RuntimeSecretPolicyChangeRule', {
    eventPattern: {
      source: ['aws.secretsmanager'],
      detailType: ['AWS API Call via CloudTrail'],
      detail: {
        eventSource: ['secretsmanager.amazonaws.com'],
        eventName: ['DeleteSecret', 'PutResourcePolicy'],
      },
    },
  });
  policyChangeRule.addTarget(new targets.SnsTopic(alerts));
  const policyChangeAlarm = new cloudwatch.Alarm(scope, 'RuntimeSecretPolicyChangeAlarm', {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Events',
      metricName: 'MatchedEvents',
      period: Duration.minutes(5),
      statistic: 'Sum',
    }),
    threshold: 1,
    evaluationPeriods: 1,
  });
  return { primaryKey, pepper, webPushSecret, alerts, policyChangeAlarm };
}
