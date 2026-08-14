import { describe, expect, it } from 'vitest';
import { legacyOwnerTaskScanInput } from '../../src/shared/store.js';

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
