import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { includeInWorkload, workloadScopes } from '@naaseh/domain';
import { tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';

export interface ProjectedWork {
  id: string;
  workType: 'task' | 'list';
  audience: string;
  lifecycle?: 'active' | 'archived' | 'deleting' | undefined;
  projectId?: string | undefined;
  categoryId?: string | undefined;
}
export interface WorkloadProjectionChange {
  workId: string;
  workType: 'task' | 'list';
  audience: string;
  scopeType: 'project' | 'category' | 'unassigned';
  scopeId: string;
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
