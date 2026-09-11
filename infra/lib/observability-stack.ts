import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as actions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sns from 'aws-cdk-lib/aws-sns';
import type { Construct } from 'constructs';

export const journalObservabilityControls = {
  protectedContentInLogs: false,
  metrics: [
    'saveFailure',
    'syncFailure',
    'authorizationDenied',
    'decryptionFailure',
    'recoveryFailure',
  ],
  costModel: 'existing-log-groups-and-metric-filters',
} as const;

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
    ranking: new logs.LogGroup(scope, 'RankingLogs', {
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
    crisisPlan?: lambda.IFunction;
    crisisPlanBroker?: lambda.IFunction;
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
  type AlarmSignal = {
    metricName: string;
    threshold: number;
    statistic?: string;
  };
  const createSignalAlarm = (
    id: string,
    signals: readonly AlarmSignal[],
    evaluationPeriods: number,
    datapointsToAlarm?: number,
  ) => {
    const usingMetrics = Object.fromEntries(
      signals.map((signal, index) => [
        `m${index + 1}`,
        applicationMetric(signal.metricName, signal.statistic),
      ]),
    );
    const expression = signals
      .map((signal, index) => `IF(FILL(m${index + 1}, 0) >= ${signal.threshold}, 1, 0)`)
      .join(' + ');
    const alarm = new cloudwatch.Alarm(scope, id, {
      alarmDescription: `Naaseh signals: ${signals.map(({ metricName }) => metricName).join(', ')}`,
      metric: new cloudwatch.MathExpression({
        expression,
        usingMetrics,
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods,
      ...(datapointsToAlarm === undefined ? {} : { datapointsToAlarm }),
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    alarm.addAlarmAction(new actions.SnsAction(alerts));
  };

  createSignalAlarm(
    'SecuritySignalAlarm',
    [
      { metricName: 'AttachmentThreats', threshold: 1 },
      { metricName: 'AuthSecurityFailures', threshold: 1 },
      { metricName: 'AdminTfaRecoveryFailures', threshold: 1 },
      { metricName: 'CrisisPlanKmsFailure', threshold: 1 },
      { metricName: 'CrisisPlanBrokerDenied', threshold: 10 },
    ],
    1,
  );
  createSignalAlarm(
    'DataIntegritySignalAlarm',
    [
      { metricName: 'WorkloadProjectionDrift', threshold: 1 },
      { metricName: 'UrgencyTotalConsistencyFailures', threshold: 1 },
      { metricName: 'ProjectionReconciliationFailures', threshold: 1 },
      { metricName: 'CompletionExportIntegrityFailures', threshold: 1 },
      { metricName: 'TaskTimerInvariantFailures', threshold: 1 },
    ],
    1,
  );
  createSignalAlarm(
    'OperationalFailureSignalAlarm',
    [
      { metricName: 'OrganizationDeleteFailures', threshold: 1 },
      { metricName: 'StackReorderFailures', threshold: 1 },
      { metricName: 'StackCompactionFailures', threshold: 1 },
      { metricName: 'FilteredReadFailures', threshold: 1 },
      { metricName: 'UrgencyReportExportFailures', threshold: 1 },
      { metricName: 'CompletionExportFailures', threshold: 1 },
      { metricName: 'TaskTimerFailures', threshold: 1 },
      { metricName: 'ExtraLowInventoryBlocked', threshold: 1 },
      { metricName: 'CrisisPlanOperationFailure', threshold: 1 },
    ],
    1,
  );
  createSignalAlarm(
    'StackDegradationSignalAlarm',
    [
      { metricName: 'StackReorderConflicts', threshold: 10 },
      { metricName: 'StackOperationLatency', threshold: 1_000, statistic: 'p95' },
    ],
    3,
    2,
  );
  createSignalAlarm(
    'ClientContentionSignalAlarm',
    [
      { metricName: 'PaginationContextRestarts', threshold: 10 },
      { metricName: 'PaginationCursorExpiries', threshold: 10 },
      { metricName: 'TaskTimerConflicts', threshold: 10 },
    ],
    3,
    2,
  );
  const dashboard = new cloudwatch.Dashboard(scope, 'OperationsDashboard');
  dashboard.addWidgets(
    new cloudwatch.GraphWidget({
      title: 'Lambda errors and throttles',
      left: [
        functions.task.metricErrors(),
        functions.sync.metricErrors(),
        functions.auth.metricErrors(),
        ...(functions.googleSync ? [functions.googleSync.metricErrors()] : []),
        ...(functions.crisisPlan ? [functions.crisisPlan.metricErrors()] : []),
        ...(functions.crisisPlanBroker ? [functions.crisisPlanBroker.metricErrors()] : []),
      ],
      right: [
        functions.task.metricThrottles(),
        functions.sync.metricThrottles(),
        functions.auth.metricThrottles(),
        ...(functions.googleSync ? [functions.googleSync.metricThrottles()] : []),
        ...(functions.crisisPlan ? [functions.crisisPlan.metricThrottles()] : []),
        ...(functions.crisisPlanBroker ? [functions.crisisPlanBroker.metricThrottles()] : []),
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
      left: [
        applicationMetric('CompletionReportLatency', 'p95'),
        applicationMetric('FilteredReadLatency', 'p95'),
        applicationMetric('FilteredReadAmplification', 'p95'),
      ],
      right: [
        functions.reporting?.metricErrors() ?? applicationMetric('CompletionReportErrors'),
        applicationMetric('UrgencyTotalConsistencyFailures'),
        applicationMetric('ProjectionReconciliationFailures'),
        applicationMetric('PaginationContextRestarts'),
        applicationMetric('PaginationCursorExpiries'),
        applicationMetric('FilteredShortPages'),
        applicationMetric('FilteredReadUnits'),
        applicationMetric('FilteredReadBytes'),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Completed-task exports',
      left: [
        applicationMetric('CompletionExports'),
        applicationMetric('CompletionExportRows'),
        applicationMetric('CompletionExportDuration', 'p95'),
      ],
      right: [
        applicationMetric('CompletionExportFailures'),
        applicationMetric('CompletionExportIntegrityFailures'),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Authentication and recovery security',
      left: [applicationMetric('AuthSecurityEvents'), applicationMetric('AuthSecurityDenials')],
      right: [
        applicationMetric('AuthSecurityFailures'),
        applicationMetric('AdminTfaRecoveries'),
        applicationMetric('AdminTfaRecoveryFailures'),
        applicationMetric('AdminAuthorizationDenials'),
      ],
    }),
    new cloudwatch.GraphWidget({
      title: 'Task timer synchronization',
      left: [
        applicationMetric('TaskTimerCommands'),
        applicationMetric('TaskTimerCommandLatency', 'p95'),
      ],
      right: [
        applicationMetric('TaskTimerConflicts'),
        applicationMetric('TaskTimerFailures'),
        applicationMetric('TaskTimerInvariantFailures'),
      ],
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
      title: 'Personal stack operations and compaction',
      left: [
        applicationMetric('StackOperationLatency', 'p95'),
        applicationMetric('StackCompactionLatency', 'p95'),
      ],
      right: [
        applicationMetric('StackReorders'),
        applicationMetric('StackReorderConflicts'),
        applicationMetric('StackReorderFailures'),
        applicationMetric('StackCompactions'),
        applicationMetric('StackCompactionFailures'),
        applicationMetric('ExtraLowInventoryBlocked'),
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

export const crisisPlanObservabilityControls = Object.freeze({
  logRetentionDays: 90,
  alarms: [
    'security-signal:CrisisPlanKmsFailure>=1',
    'security-signal:CrisisPlanBrokerDenied>=10',
    'operational-failure:CrisisPlanOperationFailure>=1',
    'restore-workflow-failure',
  ],
  allowedDimensions: [
    'operation',
    'outcome',
    'latencyBucket',
    'schemaVersion',
    'keyGeneration',
    'shareGeneration',
    'retryKind',
    'conflictKind',
  ],
  protectedFields: [
    'planHtml',
    'ciphertext',
    'ownerWrap',
    'recipientGrant',
    'cpk',
    'jmk',
    'publicKey',
    'searchQuery',
    'recipientId',
    'journalAnswers',
  ],
  expectedCost: 'bounded low-cardinality metrics and 90-day logs plus CloudTrail KMS evidence',
});
