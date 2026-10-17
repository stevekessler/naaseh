import { describe, expect, it } from 'vitest';
import { feedTransactionItems, legacyOwnerTaskScanInput } from '../../src/shared/store.js';

describe('legacy owner task scan', () => {
  it('excludes owned non-task records from task bootstrap recovery', () => {
    const input = legacyOwnerTaskScanInput('steve', { PK: 'previous', SK: 'CURRENT' });

    expect(input.FilterExpression).toBe(
      'begins_with(PK, :task) AND SK=:current AND #data.#ownerId=:owner',
    );
    expect(input.ExpressionAttributeValues).toEqual({
      ':task': 'TASK#',
      ':current': 'CURRENT',
      ':owner': 'steve',
    });
    expect(input.ExclusiveStartKey).toEqual({ PK: 'previous', SK: 'CURRENT' });
  });
});

describe('feed transaction construction', () => {
  it('uses one counter update and multiple ordered writes for one audience', () => {
    const prepared = [1, 2].map((sequence) => ({
      expectedSequence: sequence - 1,
      change: {
        audience: 'GROUP#family',
        sequence,
        entityType: 'listItem' as const,
        entityId: `item-${sequence}`,
        version: 1,
        operation: 'upsert' as const,
      },
    }));
    const items = feedTransactionItems(prepared);
    expect(items).toHaveLength(3);
    expect(items.filter((item) => item.Update)).toHaveLength(1);
    expect(items[0]?.Update?.ExpressionAttributeValues).toEqual({ ':next': 2, ':expected': 0 });
  });
});
