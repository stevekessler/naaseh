import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as backup from 'aws-cdk-lib/aws-backup';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';

export const backupControls = {
  daily: true,
  crossRegion: false,
  crossAccount: false,
  vaultLockDays: 35,
  restoreTesting: true,
  personalStack: {
    canonicalOperations: 'included',
    snapshots: 'rebuildable',
  },
} as const;

export function createBackupResources(
  scope: Construct,
  options: {
    dataKey: kms.IKey;
    table: dynamodb.ITable;
    media: s3.IBucket;
    alerts: sns.ITopic;
  },
) {
  const vault = new backup.BackupVault(scope, 'BackupVault', {
    encryptionKey: options.dataKey,
    // A short changeable window transitions the vault into compliance mode. After that
    // period, not even the account root user can weaken retention or remove recovery points.
    lockConfiguration: {
      minRetention: Duration.days(backupControls.vaultLockDays),
      maxRetention: Duration.days(365),
      changeableFor: Duration.days(3),
    },
    removalPolicy: RemovalPolicy.RETAIN,
  });
  const plan = new backup.BackupPlan(scope, 'BackupPlan', {
    backupPlanRules: [
      new backup.BackupPlanRule({
        backupVault: vault,
        scheduleExpression: events.Schedule.cron({ minute: '0', hour: '5' }),
        deleteAfter: Duration.days(backupControls.vaultLockDays),
        recoveryPointTags: {
          NaasehPersonalStackCanonicalOperations: backupControls.personalStack.canonicalOperations,
          NaasehPersonalStackSnapshots: backupControls.personalStack.snapshots,
        },
      }),
    ],
  });
  const backupRole = new iam.Role(scope, 'BackupSelectionRole', {
    assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSBackupServiceRolePolicyForBackup',
      ),
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSBackupServiceRolePolicyForS3Backup'),
    ],
  });
  // The personal-stack operation log and its derived snapshots share the durable table. Selecting
  // the table ARN (rather than row tags) guarantees a recovery point cannot omit operation chunks.
  plan.addSelection('CanonicalOperationsAndDurableResources', {
    role: backupRole,
    resources: [
      backup.BackupResource.fromDynamoDbTable(options.table),
      backup.BackupResource.fromArn(options.media.bucketArn),
    ],
  });

  const restoreRole = new iam.Role(scope, 'BackupRestoreTestingRole', {
    assumedBy: new iam.ServicePrincipal('backup.amazonaws.com'),
    managedPolicies: [
      iam.ManagedPolicy.fromAwsManagedPolicyName(
        'service-role/AWSBackupServiceRolePolicyForRestores',
      ),
      iam.ManagedPolicy.fromAwsManagedPolicyName('AWSBackupServiceRolePolicyForS3Restore'),
    ],
  });
  const restoreTestingPlanName = 'NaasehQuarterlyRestoreTest';
  const restoreTestingPlan = new backup.CfnRestoreTestingPlan(scope, 'RestoreTestingPlan', {
    restoreTestingPlanName,
    scheduleExpression: 'cron(0 6 1 */3 ? *)',
    startWindowHours: 24,
    recoveryPointSelection: {
      algorithm: 'LATEST_WITHIN_WINDOW',
      includeVaults: [vault.backupVaultArn],
      recoveryPointTypes: ['SNAPSHOT', 'CONTINUOUS'],
      selectionWindowDays: 7,
    },
    tags: [{ key: 'NaasehIsolationRequired', value: 'true' }],
  });
  const tableSelection = new backup.CfnRestoreTestingSelection(
    scope,
    'RestoreTestingTableSelection',
    {
      iamRoleArn: restoreRole.roleArn,
      protectedResourceArns: [options.table.tableArn],
      protectedResourceType: 'DynamoDB',
      restoreTestingPlanName,
      restoreTestingSelectionName: 'NaasehDynamoDB',
      validationWindowHours: 4,
    },
  );
  const mediaSelection = new backup.CfnRestoreTestingSelection(
    scope,
    'RestoreTestingMediaSelection',
    {
      iamRoleArn: restoreRole.roleArn,
      protectedResourceArns: [options.media.bucketArn],
      protectedResourceType: 'S3',
      restoreTestingPlanName,
      restoreTestingSelectionName: 'NaasehProfileMedia',
      validationWindowHours: 4,
    },
  );
  tableSelection.addResourceDependency(restoreTestingPlan);
  mediaSelection.addResourceDependency(restoreTestingPlan);

  const failureRule = new events.Rule(scope, 'BackupFailureRule', {
    eventPattern: {
      source: ['aws.backup'],
      detailType: ['Backup Job State Change', 'Copy Job State Change', 'Restore Job State Change'],
      detail: { status: ['FAILED', 'ABORTED', 'EXPIRED'] },
    },
  });
  failureRule.addTarget(new targets.SnsTopic(options.alerts));
  const failureAlarm = new cloudwatch.Alarm(scope, 'BackupFailureAlarm', {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Events',
      metricName: 'MatchedEvents',
      dimensionsMap: { RuleName: failureRule.ruleName },
      statistic: 'Sum',
      period: Duration.minutes(5),
    }),
    threshold: 1,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  failureAlarm.addAlarmAction(new actions.SnsAction(options.alerts));

  return {
    vault,
    plan,
    restoreTestingPlan,
    restoreRole,
    failureAlarm,
  };
}
