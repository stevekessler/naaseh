import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { ScheduledHandler } from 'aws-lambda';
import { metric, log } from '@naaseh/observability';
import { dynamodb, tableName } from '../shared/dynamodb.js';

export const handler: ScheduledHandler = async (event) => {
  const [work, projections] = await Promise.all([
    dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: '(begins_with(PK,:task) OR begins_with(PK,:list)) AND SK=:current',
        ExpressionAttributeValues: { ':task': 'TASK#', ':list': 'LIST#', ':current': 'CURRENT' },
        Select: 'COUNT',
      }),
    ),
    dynamodb.send(
      new ScanCommand({
        TableName: tableName,
        FilterExpression: 'begins_with(PK,:workload) AND begins_with(SK,:pointer)',
        ExpressionAttributeValues: { ':workload': 'WORKLOAD#', ':pointer': 'ITEM#' },
        Select: 'COUNT',
      }),
    ),
  ]);
  const sourceCount = work.Count ?? 0;
  const pointerCount = projections.Count ?? 0;
  const drift = Math.max(0, sourceCount - pointerCount);
  metric('WorkloadProjectionDrift', drift);
  metric('WorkloadProjectionReconciliations', 1);
  log('workload.projection_reconciliation', {
    requestId: event.id,
    outcome: drift ? 'drift-detected' : 'consistent',
    sourceCount,
    pointerCount,
    drift,
  });
};
