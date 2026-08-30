import { describe, expect, it } from 'vitest';
import {
  journalRestoreAuditHash,
  validateJournalRestore,
} from '../../apps/api/src/crypto-recovery/journal-restore-validator.js';

describe('journal restore verification', () => {
  it('verifies ciphertext inventory and tamper-evident audit without decryption', () => {
    const base = {
      sequence: 1,
      requestId: 'request',
      operation: 'rewrapped',
      actorId: 'recovery-admin',
      outcome: 'success',
      at: 1,
      priorHash: 'GENESIS',
    };
    expect(
      validateJournalRestore({
        records: [{ ownerId: 'owner', keyVersion: 2, ciphertext: 'opaque' }],
        audit: [{ ...base, hash: journalRestoreAuditHash(base) }],
        authorizedOwners: new Set(['owner']),
        minimumKeyVersion: 2,
      }),
    ).toEqual({ records: 1, auditRows: 1 });
  });
  it('rejects plaintext, rollback, unauthorized grants, and altered chains', () => {
    const options = { audit: [], authorizedOwners: new Set(['owner']), minimumKeyVersion: 2 };
    expect(() =>
      validateJournalRestore({
        ...options,
        records: [{ ownerId: 'owner', keyVersion: 2, notes: 'secret' }],
      }),
    ).toThrow('plaintext');
    expect(() =>
      validateJournalRestore({ ...options, records: [{ ownerId: 'owner', keyVersion: 1 }] }),
    ).toThrow('rolls back');
    expect(() =>
      validateJournalRestore({ ...options, records: [{ ownerId: 'other', keyVersion: 2 }] }),
    ).toThrow('unauthorized');
    expect(() =>
      validateJournalRestore({
        ...options,
        records: [],
        audit: [
          {
            sequence: 1,
            requestId: 'r',
            operation: 'x',
            actorId: 'a',
            outcome: 'x',
            at: 1,
            priorHash: 'GENESIS',
            hash: 'altered',
          },
        ],
      }),
    ).toThrow('altered');
  });
});
