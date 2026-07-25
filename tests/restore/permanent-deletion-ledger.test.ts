import { describe, expect, it } from 'vitest';
import { filterDeletedRestoreRecords } from '../../apps/api/src/crypto-recovery/deletion-ledger-validator.js';

describe('permanent deletion restore ledger', () => {
  it('prevents a pre-delete backup from resurrecting deleted content', () => {
    const records = [
      { resourceType: 'task' as const, resourceId: 'a', value: 'deleted' },
      { resourceType: 'task' as const, resourceId: 'b', value: 'kept' },
    ];
    expect(filterDeletedRestoreRecords(records, new Set(['task:a']))).toEqual([records[1]]);
  });
});
