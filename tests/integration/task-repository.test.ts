import { describe, expect, it } from 'vitest';
import { createTask, type TaskRevision } from '@naaseh/domain';
import { buildTaskTransaction } from '../../apps/api/src/shared/store.js';
describe('task persistence transaction', () => {
  it('atomically includes current state, immutable revision, idempotency result, feed counter, and feed change', () => {
    const task = createTask({ label: 'x' }, 'u', new Date('2026-01-01T00:00:00Z'));
    const revision: TaskRevision = {
      id: 'r',
      taskId: task.id,
      mutationId: 'm',
      actorId: 'u',
      version: 1,
      changedAt: task.updatedAt,
      operation: 'create',
      changedFields: ['label'],
    };
    const input = buildTaskTransaction(task, revision, 'm', [
      {
        expectedSequence: 0,
        change: {
          audience: 'PUBLIC',
          sequence: 1,
          entityId: task.id,
          operation: 'upsert',
          payload: task,
          changedAt: task.updatedAt,
        },
      },
    ]);
    expect(input.TransactItems).toHaveLength(5);
    expect(input.TransactItems?.[0]?.Put?.ConditionExpression).toContain('#version');
    expect(input.TransactItems?.[1]?.Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(input.TransactItems?.[2]?.Put?.Item).toMatchObject({
      PK: 'USER#u',
      SK: 'MUTATION#m',
      version: 1,
    });
    expect(input.TransactItems?.[3]?.Update?.ConditionExpression).toContain(':expected');
    expect(input.TransactItems?.[4]?.Put?.ConditionExpression).toBe('attribute_not_exists(PK)');
  });
  it('uses the same mutation identity for stable replay results', () => {
    const task = createTask({ label: 'x' }, 'u');
    const revision: TaskRevision = {
      id: 'r',
      taskId: task.id,
      mutationId: 'same',
      actorId: 'u',
      version: 1,
      changedAt: task.updatedAt,
      operation: 'create',
      changedFields: ['label'],
    };
    const first = buildTaskTransaction(task, revision, 'same');
    const replay = buildTaskTransaction(task, revision, 'same');
    expect(first.TransactItems?.[2]?.Put?.Item).toMatchObject(
      replay.TransactItems?.[2]?.Put?.Item ?? {},
    );
  });
});
