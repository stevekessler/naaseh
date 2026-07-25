import { describe, expect, it } from 'vitest';
import { completeAndArchiveTask, createTask, createUlid } from '@naaseh/domain';
import { buildTaskTransaction } from '../../apps/api/src/shared/store.js';

describe('archive lifecycle transaction', () => {
  it('commits task, revision, completion event, mutation result, and audience feed together', () => {
    const initial = createTask({ label: 'Atomic' }, 'owner', new Date('2026-07-24T12:00:00Z'));
    const { task, completionEvent } = completeAndArchiveTask(initial, 'owner', {});
    const transaction = buildTaskTransaction(
      task,
      {
        id: createUlid(),
        taskId: task.id,
        actorId: 'owner',
        version: task.version,
        changedAt: task.updatedAt,
        operation: 'completeAndArchive',
        changedFields: ['lifecycle'],
        after: { lifecycle: 'archived' },
        syncOutcome: 'applied',
      },
      createUlid(),
      [],
      [{ Put: { TableName: 'test', Item: { PK: `COMPLETION#${completionEvent.id}` } } }],
    );
    expect(transaction.TransactItems).toHaveLength(4);
  });
});
