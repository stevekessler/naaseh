import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import {
  includeInWorkload,
  workloadScopes,
  zeroUrgencyCounts,
  type Urgency,
  type UrgencyCounts,
} from '@naaseh/domain';
import { tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface ProjectedWork {
  id: string;
  workType: 'task' | 'list';
  audience: string;
  lifecycle?: 'active' | 'archived' | 'deleting' | undefined;
  projectId?: string | undefined;
  categoryId?: string | undefined;
  urgency?: Urgency | undefined;
}
export interface WorkloadProjectionChange {
  workId: string;
  workType: 'task' | 'list';
  audience: string;
  scopeType: 'project' | 'category' | 'unassigned';
  scopeId: string;
  urgency: Urgency;
  delta: 1 | -1;
}

const projections = (work: ProjectedWork | undefined, delta: 1 | -1) =>
  work && includeInWorkload(work)
    ? workloadScopes(work.projectId, work.categoryId).map((scope) => ({
        workId: work.id,
        workType: work.workType,
        audience: work.audience,
        scopeType: scope.type,
        scopeId: scope.id,
        urgency: work.urgency ?? 'medium',
        delta,
      }))
    : [];

export function workloadProjectionChanges(
  before: ProjectedWork | undefined,
  after: ProjectedWork | undefined,
): WorkloadProjectionChange[] {
  const all = [...projections(before, -1), ...projections(after, 1)];
  const grouped = new Map<string, WorkloadProjectionChange>();
  for (const change of all) {
    const identity = [
      change.audience,
      change.scopeType,
      change.scopeId,
      change.workType,
      change.workId,
      change.urgency,
    ].join('|');
    const prior = grouped.get(identity);
    if (prior && prior.delta !== change.delta) grouped.delete(identity);
    else grouped.set(identity, change);
  }
  return [...grouped.values()];
}

export function workloadProjectionWrites(
  changes: WorkloadProjectionChange[],
): NonNullable<TransactWriteCommandInput['TransactItems']> {
  return changes.flatMap((change) => {
    const counter = keys.workloadCounter(
      change.audience,
      change.scopeType,
      change.scopeId,
      change.workType,
    );
    const pointer = keys.workloadPointer(
      change.audience,
      change.scopeType,
      change.scopeId,
      change.workType,
      change.workId,
    );
    const urgencyCounter = {
      PK: counter.PK,
      SK: `${counter.SK}#URGENCY#${change.urgency}`,
    };
    return [
      {
        Update: {
          TableName: tableName,
          Key: counter,
          UpdateExpression: 'ADD #count :delta SET #updatedAt=:now',
          ExpressionAttributeNames: { '#count': 'count', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: {
            ':delta': change.delta,
            ':now': new Date().toISOString(),
          },
        },
      },
      {
        Update: {
          TableName: tableName,
          Key: urgencyCounter,
          UpdateExpression: 'ADD #count :delta SET #updatedAt=:now',
          ExpressionAttributeNames: { '#count': 'count', '#updatedAt': 'updatedAt' },
          ExpressionAttributeValues: {
            ':delta': change.delta,
            ':now': new Date().toISOString(),
          },
        },
      },
      change.delta > 0
        ? {
            Put: {
              TableName: tableName,
              Item: { ...pointer, workId: change.workId },
              ConditionExpression: 'attribute_not_exists(PK)',
            },
          }
        : { Delete: { TableName: tableName, Key: pointer } },
    ];
  });
}

export function calculateWorkloadUrgencyBreakdown(
  work: readonly { urgency: Urgency; lifecycle?: 'active' | 'archived' | 'deleting' }[],
): UrgencyCounts {
  const counts = zeroUrgencyCounts();
  for (const item of work) if (includeInWorkload(item)) counts[item.urgency] += 1;
  return counts;
}

export interface UrgencyProjectionState {
  counts: UrgencyCounts;
  appliedEventIds: Set<string>;
}

/** Deterministic idempotent reducer used by stream consumers and reconciliation tests. */
export async function applyUrgencyProjectionEvent(input: {
  eventId: string;
  before?: { urgency: Urgency; lifecycle?: 'active' | 'archived' | 'deleting' };
  after?: { urgency: Urgency; lifecycle?: 'active' | 'archived' | 'deleting' };
  state?: UrgencyProjectionState;
}): Promise<UrgencyCounts> {
  const state = input.state ?? { counts: zeroUrgencyCounts(), appliedEventIds: new Set<string>() };
  if (state.appliedEventIds.has(input.eventId)) return state.counts;
  if (input.before && includeInWorkload(input.before)) state.counts[input.before.urgency] -= 1;
  if (input.after && includeInWorkload(input.after)) state.counts[input.after.urgency] += 1;
  state.appliedEventIds.add(input.eventId);
  return state.counts;
}
