import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
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
    googleSync?: lambda.IFunction;
  },
  table: dynamodb.ITable,
  alerts: sns.ITopic,
) {
  const applicationMetric = (metricName: string, statistic = 'Sum') =>
    new cloudwatch.Metric({
      namespace: 'Naaseh',
      metricName,
      statistic,
      period: Duration.minutes(5),
    });
  for (const [id, metricName] of [
    ['AttachmentThreatAlarm', 'AttachmentThreats'],
    ['WorkloadProjectionDriftAlarm', 'WorkloadProjectionDrift'],
    ['OrganizationDeleteFailureAlarm', 'OrganizationDeleteFailures'],
  ] as const) {
    const alarm = new cloudwatch.Alarm(scope, id, {
      metric: applicationMetric(metricName),
      threshold: 1,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new actions.SnsAction(alerts));
  }
  const dashboard = new cloudwatch.Dashboard(scope, 'OperationsDashboard');
  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'Lambda errors and throttles',
      left: [
        functions.task.metricErrors(),
        functions.sync.metricErrors(),
        functions.auth.metricErrors(),
        ...(functions.googleSync ? [functions.googleSync.metricErrors()] : []),
      ],
      right: [
        functions.task.metricThrottles(),
        functions.sync.metricThrottles(),
        functions.auth.metricThrottles(),
        ...(functions.googleSync ? [functions.googleSync.metricThrottles()] : []),
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
      title: 'Google synchronization health',
      left: [
        applicationMetric('GoogleSyncAuthorizationFailures'),
        applicationMetric('GoogleSyncRevocations'),
        applicationMetric('GoogleSyncRunFailures'),
        applicationMetric('GoogleSyncCheckpointStalls'),
      ],
      right: [
        applicationMetric('GoogleSyncThrottles'),
        applicationMetric('GoogleSyncConflicts'),
        applicationMetric('GoogleSyncQuarantines'),
        applicationMetric('GoogleSyncLagSeconds', 'Maximum'),
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
