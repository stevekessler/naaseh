import { describe, expect, it } from 'vitest';
import { createTask, type TaskRevision } from '@naaseh/domain';
import { buildTaskTransaction } from '../../apps/api/src/shared/store.js';

describe('atomic privacy access changes', () => {
  it('commits current private state, revision, replay result, public tombstone, and owner upsert together', () => {
    const task = {
      ...createTask({ label: 'Private now', visibility: 'private' }, 'steve'),
      version: 2,
    };
    const revision: TaskRevision = {
      id: 'revision-1',
      taskId: task.id,
      mutationId: 'mutation-1',
      actorId: 'steve',
      version: 2,
      changedAt: task.updatedAt,
      operation: 'privacy',
      changedFields: ['visibility'],
    };
    const transaction = buildTaskTransaction(task, revision, 'mutation-1', [
      {
        expectedSequence: 8,
        change: {
          audience: 'PUBLIC',
          sequence: 9,
          entityId: task.id,
          operation: 'tombstone',
          changedAt: task.updatedAt,
        },
      },
      {
        expectedSequence: 3,
        change: {
          audience: 'OWNER#steve',
          sequence: 4,
          entityId: task.id,
          operation: 'upsert',
          payload: task,
          changedAt: task.updatedAt,
        },
      },
    ]);
    expect(transaction.TransactItems).toHaveLength(7);
    expect(transaction.TransactItems?.[0]?.Put?.Item?.GSI1PK).toBe('TASK#OWNER#steve');
    expect(transaction.TransactItems?.[4]?.Put?.Item?.data).toMatchObject({
      operation: 'tombstone',
    });
    expect(transaction.TransactItems?.[4]?.Put?.Item?.data).not.toHaveProperty('payload');
    expect(transaction.TransactItems?.[6]?.Put?.Item?.data).toMatchObject({
      operation: 'upsert',
      payload: task,
    });
    expect(transaction.TransactItems?.[2]?.Put?.Item).toMatchObject({
      PK: 'USER#steve',
      SK: 'MUTATION#mutation-1',
    });
  });
});
