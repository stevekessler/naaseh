import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import type { Construct } from 'constructs';

export const retention = {
  applicationDays: 30,
  authenticationDays: 90,
  recoveryDays: 90,
  auditDays: 90,
} as const;
export function createLogGroups(scope: Construct) {
  return {
    task: new logs.LogGroup(scope, 'TaskLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    }),
    auth: new logs.LogGroup(scope, 'AuthLogs', {
      retention: logs.RetentionDays.THREE_MONTHS,
      removalPolicy: RemovalPolicy.RETAIN,
    }),
    sync: new logs.LogGroup(scope, 'SyncLogs', {
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.RETAIN,
    }),
  };
}
export function createOperationalVisibility(
  scope: Construct,
  functions: {
    task: lambda.IFunction;
    auth: lambda.IFunction;
    sync: lambda.IFunction;
    reporting?: lambda.IFunction;
  },
  table: dynamodb.ITable,
) {
  new cloudwatch.Alarm(scope, 'TaskErrors', {
    metric: functions.task.metricErrors({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
  });
  new cloudwatch.Alarm(scope, 'AuthThrottles', {
    metric: functions.auth.metricThrottles({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
  });
  new cloudwatch.Alarm(scope, 'SyncErrors', {
    metric: functions.sync.metricErrors({ period: Duration.minutes(5) }),
    threshold: 1,
    evaluationPeriods: 1,
  });
  if (functions.reporting)
    new cloudwatch.Alarm(scope, 'ReportingErrors', {
      metric: functions.reporting.metricErrors({ period: Duration.minutes(5) }),
      threshold: 1,
      evaluationPeriods: 1,
    });
  new cloudwatch.Alarm(scope, 'CompletionReportLatencyAlarm', {
    metric: new cloudwatch.Metric({
      namespace: 'Naaseh',
      metricName: 'CompletionReportLatency',
      statistic: 'p95',
      period: Duration.minutes(5),
    }),
    threshold: 1000,
    evaluationPeriods: 2,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  new cloudwatch.Alarm(scope, 'AuthDuration', {
    metric: functions.auth.metricDuration({ period: Duration.minutes(5), statistic: 'p95' }),
    threshold: 1000,
    evaluationPeriods: 1,
  });
  const applicationMetric = (metricName: string, statistic = 'Sum') =>
    new cloudwatch.Metric({
      namespace: 'Naaseh',
      metricName,
      statistic,
      period: Duration.minutes(5),
    });
  new cloudwatch.Alarm(scope, 'SyncConflictAlarm', {
    metric: applicationMetric('SyncConflicts'),
    threshold: 10,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  new cloudwatch.Alarm(scope, 'SyncRetryableFailureAlarm', {
    metric: applicationMetric('SyncRetryableFailures'),
    threshold: 5,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  new cloudwatch.Alarm(scope, 'WebPushDeliveryFailureAlarm', {
    metric: applicationMetric('WebPushDeliveryFailures'),
    threshold: 5,
    evaluationPeriods: 1,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  new cloudwatch.Alarm(scope, 'SyncBacklogDepthAlarm', {
    metric: applicationMetric('SyncBacklogDepth', 'Maximum'),
    threshold: 25,
    evaluationPeriods: 3,
    treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
  });
  for (const [id, metricName, threshold] of [
    ['ContentAuthorizationDeniedAlarm', 'ContentAuthorizationDenied', 25],
    ['AttachmentScanFailureAlarm', 'AttachmentScanFailures', 1],
    ['AttachmentThreatAlarm', 'AttachmentThreats', 1],
    ['AttachmentStalledUploadAlarm', 'AttachmentExpiredUploads', 5],
    ['AttachmentStalledScanAlarm', 'AttachmentStalledScans', 1],
    ['AttachmentOrphanAlarm', 'AttachmentOrphanBlobs', 1],
    ['AttachmentMissingObjectAlarm', 'AttachmentMissingObjects', 1],
    ['ExportFailureAlarm', 'ExportFailures', 1],
    ['WorkloadProjectionDriftAlarm', 'WorkloadProjectionDrift', 1],
    ['OrganizationDeleteBlockedAlarm', 'OrganizationDeleteBlocked', 5],
    ['OrganizationDeleteFailureAlarm', 'OrganizationDeleteFailures', 1],
  ] as const)
    new cloudwatch.Alarm(scope, id, {
      metric: applicationMetric(metricName),
      threshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  for (const [id, metricName, threshold] of [
    ['UserProvisionFailureAlarm', 'UserProvisionFailures', 1],
    ['UserStatusChangeSpikeAlarm', 'UserStatusChanges', 20],
    ['CategoryAdminChangeSpikeAlarm', 'CategoryAdminChanges', 30],
  ] as const)
    new cloudwatch.Alarm(scope, id, {
      metric: applicationMetric(metricName),
      threshold,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  const dashboard = new cloudwatch.Dashboard(scope, 'OperationsDashboard');
  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'Lambda errors and throttles',
      left: [
        functions.task.metricErrors(),
        functions.sync.metricErrors(),
        functions.auth.metricErrors(),
      ],
      right: [
        functions.task.metricThrottles(),
        functions.sync.metricThrottles(),
        functions.auth.metricThrottles(),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Administrative changes and provisioning failures',
      left: [
        applicationMetric('UserStatusChanges'),
        applicationMetric('CategoryAdminChanges'),
        applicationMetric('OrganizationDeleteBlocked'),
      ],
      right: [
        applicationMetric('UserProvisionFailures'),
        applicationMetric('OrganizationDeleteFailures'),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Completion reporting',
      left: [applicationMetric('CompletionReportLatency', 'p95')],
      right: [functions.reporting?.metricErrors() ?? applicationMetric('CompletionReportErrors')],
    }),
    new cloudwatch.GraphWidget({
      title: 'DynamoDB throttles',
      left: [
        table.metricThrottledRequestsForOperations({
          operations: [
            dynamodb.Operation.PUT_ITEM,
            dynamodb.Operation.UPDATE_ITEM,
            dynamodb.Operation.QUERY,
          ],
        }),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Sync conflicts/retries and Web Push failures',
      left: [applicationMetric('SyncConflicts'), applicationMetric('SyncRetryableFailures')],
      right: [
        applicationMetric('WebPushDeliveryFailures'),
        applicationMetric('SyncBacklogDepth', 'Maximum'),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Attachment security and reconciliation',
      left: [
        applicationMetric('AttachmentScanFailures'),
        applicationMetric('AttachmentThreats'),
        applicationMetric('AttachmentStalledScans'),
      ],
      right: [
        applicationMetric('AttachmentBytes', 'Sum'),
        applicationMetric('AttachmentOrphanBlobs'),
        applicationMetric('AttachmentMissingObjects'),
      ],
    }),
  );
  return dashboard;
}
