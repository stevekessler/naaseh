import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import type { Construct } from 'constructs';

export const recoveryKeyControls = {
  region: 'us-west-2',
  multiRegion: false,
  deletionDenied: true,
  wrappingAlgorithm: 'RSAES_OAEP_SHA_256',
  signingAlgorithm: 'RSASSA_PSS_SHA_256',
} as const;

export function createRecoveryKeys(
  scope: Construct,
  options: { breakGlassRoleArn: string; alerts: sns.ITopic },
) {
  const recoveryWrappingKey = new kms.Key(scope, 'RecoveryMemoWrappingKey', {
    alias: 'alias/naaseh-memo-recovery',
    description: 'Single-Region public-key authority for hidden-memo recovery wraps.',
    keySpec: kms.KeySpec.RSA_3072,
    keyUsage: kms.KeyUsage.ENCRYPT_DECRYPT,
    multiRegion: false,
    removalPolicy: RemovalPolicy.RETAIN,
    pendingWindow: Duration.days(30),
  });
  const manifestSigningKey = new kms.Key(scope, 'BackupManifestSigningKey', {
    alias: 'alias/naaseh-backup-signing',
    description: 'Single-Region signing authority for canonical backup manifests.',
    keySpec: kms.KeySpec.RSA_3072,
    keyUsage: kms.KeyUsage.SIGN_VERIFY,
    multiRegion: false,
    removalPolicy: RemovalPolicy.RETAIN,
    pendingWindow: Duration.days(30),
  });
  const destructiveDeny = new iam.PolicyStatement({
    effect: iam.Effect.DENY,
    principals: [new iam.AnyPrincipal()],
    actions: ['kms:ScheduleKeyDeletion', 'kms:DisableKey'],
    resources: ['*'],
    conditions: { StringNotEquals: { 'aws:PrincipalArn': options.breakGlassRoleArn } },
  });
  recoveryWrappingKey.addToResourcePolicy(destructiveDeny);
  manifestSigningKey.addToResourcePolicy(destructiveDeny);
  const publicRegistryValue = Stack.of(scope).toJsonString({
    schema: 'naaseh-recovery-key-registry/v1',
    region: recoveryKeyControls.region,
    keys: [
      {
        authority: 'recovery',
        region: recoveryKeyControls.region,
        keyId: recoveryWrappingKey.keyArn,
        algorithm: recoveryKeyControls.wrappingAlgorithm,
        version: 1,
        state: 'active',
      },
    ],
  });
  const publicRegistry = new ssm.StringParameter(scope, 'RecoveryPublicKeyRegistry', {
    parameterName: '/naaseh/recovery/public-key-registry',
    stringValue: publicRegistryValue,
  });
  const policyChangeRule = new events.Rule(scope, 'RecoveryKeyPolicyChangeRule', {
    eventPattern: {
      source: ['aws.kms'],
      detailType: ['AWS API Call via CloudTrail'],
      detail: {
        eventSource: ['kms.amazonaws.com'],
        eventName: ['DisableKey', 'ScheduleKeyDeletion', 'PutKeyPolicy', 'DeleteAlias'],
      },
    },
  });
  policyChangeRule.addTarget(new targets.SnsTopic(options.alerts));
  const policyChangeAlarm = new cloudwatch.Alarm(scope, 'RecoveryKeyPolicyChangeAlarm', {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Events',
      metricName: 'MatchedEvents',
      dimensionsMap: { RuleName: policyChangeRule.ruleName },
      statistic: 'Sum',
      period: Duration.minutes(5),
    }),
    threshold: 1,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  policyChangeAlarm.addAlarmAction(new actions.SnsAction(options.alerts));
  return {
    recoveryWrappingKey,
    manifestSigningKey,
    publicRegistry,
    publicRegistryValue,
    policyChangeAlarm,
  };
}
