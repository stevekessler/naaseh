import { describe, expect, it } from 'vitest';
import { assertDeletionLedgerApplied } from '../../apps/api/src/crypto-recovery/deletion-ledger-validator.js';

describe('archive/project/reporting restore drill', () => {
  it('blocks serving a restore until deleted records are purged by the ledger', () => {
    const ledgerKeys = new Set(['task:deleted']);
    expect(() =>
      assertDeletionLedgerApplied({
        restoredRecords: [{ resourceType: 'task', resourceId: 'deleted' }],
        ledgerKeys,
      }),
    ).toThrow();
    expect(() => assertDeletionLedgerApplied({ restoredRecords: [], ledgerKeys })).not.toThrow();
  });
});
