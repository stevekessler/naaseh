import { describe, expect, it } from 'vitest';
import { createList, type EntityRevision } from '@naaseh/domain';
import { buildEntityTransaction } from '../../apps/api/src/shared/store.js';

describe('list repository transaction', () => {
  it('commits current data, immutable revision, stable replay result, and feed atomically', () => {
    const list = createList({ name: 'Groceries' }, 'owner');
    const revision: EntityRevision = {
      id: '01J00000000000000000000001',
      entityType: 'list',
      entityId: list.id,
      mutationId: '01J00000000000000000000002',
      actorId: 'owner',
      version: 1,
      changedAt: list.updatedAt,
      operation: 'create',
      changedFields: ['name'],
      after: {},
      syncOutcome: 'applied',
    };
    const transaction = buildEntityTransaction({
      current: {
        PK: `LIST#${list.id}`,
        SK: 'CURRENT',
        data: list,
        version: list.version,
      },
      revision,
      actorId: 'owner',
      expectedVersion: 0,
      mutationResult: { mutationId: revision.mutationId, status: 'applied', version: 1 },
      feedChanges: [
        {
          expectedSequence: 0,
          change: {
            audience: 'PUBLIC',
            entityType: 'list',
            entityId: list.id,
            version: 1,
            operation: 'upsert',
            payload: list,
            changedAt: list.updatedAt,
            sequence: 1,
          },
        },
      ],
    });
    expect(transaction.TransactItems).toHaveLength(5);
    expect(transaction.TransactItems?.[0]?.Put?.ConditionExpression).toContain(':expected');
    expect(transaction.TransactItems?.[1]?.Put?.ConditionExpression).toBe(
      'attribute_not_exists(PK)',
    );
    expect(transaction.TransactItems?.[2]?.Put?.Item?.data).toMatchObject({ status: 'applied' });
  });
});
