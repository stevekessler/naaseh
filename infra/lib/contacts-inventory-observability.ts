import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as destinations from 'aws-cdk-lib/aws-logs-destinations';
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
  for (const [id, metricName, statistic, threshold] of [
    ['ImageScanAge', 'ContactsInventoryScanAgeSeconds', 'Maximum', 900],
    ['ImageReconciliationBacklog', 'ContactsInventoryReconciliationBacklog', 'Sum', 20],
  ] as const) {
    new cloudwatch.Alarm(scope, id, {
      metric: new cloudwatch.Metric({
        namespace: 'Naaseh',
        metricName,
        statistic,
        period,
      }),
      threshold,
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }
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

export function retainFeatureAudit(scope: Construct, application: logs.ILogGroup) {
  const audit = new logs.LogGroup(scope, 'AuditLogs', {
    retention: logs.RetentionDays.THREE_MONTHS,
    removalPolicy: RemovalPolicy.RETAIN,
  });
  // The subscription copies a fixed metadata projection. It never forwards the raw log line.
  const archive = new lambda.Function(scope, 'AuditArchive', {
    runtime: lambda.Runtime.NODEJS_24_X,
    handler: 'index.handler',
    code: lambda.Code.fromInline(`
const { gunzipSync } = require('node:zlib');
exports.handler = ({ awslogs }) => {
  const payload = JSON.parse(gunzipSync(Buffer.from(awslogs.data, 'base64')));
  for (const { message } of payload.logEvents ?? []) {
    try {
      const entry = JSON.parse(message.slice(message.indexOf('{')));
      if (entry.operation !== 'contactsInventory.audit') continue;
      const { operationType, correlationId, status, latencyMs } = entry;
      if (!['contacts', 'inventory', 'catalogs', 'checkpoint', 'changes', 'unknown'].includes(operationType) ||
          !Number.isInteger(status) || !Number.isFinite(latencyMs)) continue;
      console.info(JSON.stringify({
        operationType, status, latencyMs,
        correlationId: typeof correlationId === 'string' && /^[A-Za-z0-9_=-]{1,128}$/.test(correlationId)
          ? correlationId : undefined
      }));
    } catch {}
  }
};
`),
    logGroup: audit,
    timeout: Duration.seconds(15),
  });
  new logs.SubscriptionFilter(scope, 'RetainAuditRequests', {
    logGroup: application,
    filterPattern: logs.FilterPattern.literal('"contactsInventory.audit"'),
    destination: new destinations.LambdaDestination(archive),
  });
}
