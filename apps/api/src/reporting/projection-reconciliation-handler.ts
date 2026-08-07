import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import type { ScheduledHandler } from 'aws-lambda';
import { metric } from '@naaseh/observability';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import type { ProjectedWorkView } from './work-view-repository.js';
import { recordReconciliation } from './telemetry.js';

export interface WorkloadReconciliationTelemetry {
  missing: number;
  stale: number;
  orphan: number;
  unauthorized: number;
}

/**
 * Produces a deterministic repair summary. DynamoDB repair workers use this
 * comparison after hydrating canonical work; authorization is always checked
 * before a pointer is retained or recreated.
 */
export async function reconcileWorkloadUrgencyProjections(input: {
  canonical: readonly ProjectedWorkView[];
  pointers: readonly ProjectedWorkView[];
  reauthorize: (work: ProjectedWorkView) => boolean | Promise<boolean>;
}) {
  const canonical = new Map(input.canonical.map((work) => [work.id, work]));
  const pointers = new Map(input.pointers.map((work) => [work.id, work]));
  const telemetry: WorkloadReconciliationTelemetry = {
    missing: 0,
    stale: 0,
    orphan: 0,
    unauthorized: 0,
  };
  const affected = new Set<string>();
  for (const work of input.canonical) {
    if (!(await input.reauthorize(work))) {
      telemetry.unauthorized += 1;
      if (pointers.has(work.id)) affected.add(work.id);
      continue;
    }
    const pointer = pointers.get(work.id);
    if (!pointer) {
      telemetry.missing += 1;
      affected.add(work.id);
    } else if (
      pointer.urgency !== work.urgency ||
      pointer.lifecycle !== work.lifecycle ||
      pointer.projectId !== work.projectId ||
      pointer.categoryId !== work.categoryId ||
      pointer.audience !== work.audience
    ) {
      telemetry.stale += 1;
      affected.add(work.id);
    }
  }
  for (const pointer of input.pointers) {
    if (!canonical.has(pointer.id)) {
      telemetry.orphan += 1;
      affected.add(pointer.id);
    }
  }
  return {
    repaired: affected.size,
    sourceEpochsAdvanced: affected.size,
    telemetry,
  };
}

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
  recordReconciliation({
    outcome: drift ? 'failure' : 'success',
    missing: drift,
    stale: 0,
    orphan: Math.max(0, pointerCount - sourceCount),
    unauthorized: 0,
  });
  void event.id;
};
