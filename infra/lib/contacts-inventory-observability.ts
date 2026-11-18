import { Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import type { Construct } from 'constructs';

export function observeContactsInventory(scope: Construct, backupVaultName: string) {
  const period = Duration.minutes(5);
  new cloudwatch.Alarm(scope, 'FeatureRequestFailures', {
    metric: new cloudwatch.Metric({
      namespace: 'Naaseh',
      metricName: 'ContactsInventoryRequestFailures',
      statistic: 'Sum',
      period,
    }),
    threshold: 3,
    evaluationPeriods: 3,
    datapointsToAlarm: 2,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  const backupFailures = new events.Rule(scope, 'FeatureBackupFailures', {
    eventPattern: {
      source: ['aws.backup'],
      detailType: ['Backup Job State Change'],
      detail: { backupVaultName: [backupVaultName], state: ['FAILED', 'ABORTED', 'EXPIRED'] },
    },
  });
  new cloudwatch.Alarm(scope, 'FeatureBackupFailureAlarm', {
    metric: new cloudwatch.Metric({
      namespace: 'AWS/Events',
      metricName: 'MatchedEvents',
      dimensionsMap: { RuleName: backupFailures.ruleName },
      statistic: 'Sum',
      period,
    }),
    threshold: 1,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
}
