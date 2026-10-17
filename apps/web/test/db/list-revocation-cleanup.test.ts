import { describe, expect, it } from 'vitest';
import { childRecordsForRevokedLists } from '../../src/db/outbox.js';

describe('list audience revocation cleanup', () => {
  it('selects every locally cached child of a revoked parent and no unrelated children', () => {
    const children = [
      { id: 'one', taskId: 'revoked' },
      { id: 'two', taskId: 'revoked' },
      { id: 'other', taskId: 'kept' },
    ];
    expect(childRecordsForRevokedLists(children, ['revoked'])).toEqual(children.slice(0, 2));
  });
});
