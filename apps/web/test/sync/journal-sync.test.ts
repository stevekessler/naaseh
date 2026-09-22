import { describe, expect, it } from 'vitest';
import { prepareJournalMutationForSync } from '../../src/sync/journal-sync.js';

const envelope = (recordKind: 'projection' | 'body') => ({
  recordKind,
  schemaVersion: 1,
  keyVersion: 1,
  iv: 'A'.repeat(16),
  ciphertext: 'B'.repeat(24),
  byteSize: 16,
});

const dateToken = 'D'.repeat(43);
const entryMutation = {
  id: '11111111-1111-4111-8111-111111111111',
  entityType: 'journalEntry' as const,
  operation: 'upsert' as const,
  entityId: '22222222-2222-4222-8222-222222222222',
  baseVersion: 0,
  payload: {
    entryId: '22222222-2222-4222-8222-222222222222',
    dateToken,
    projection: envelope('projection'),
    body: envelope('body'),
  },
  createdAt: '2026-09-22T12:00:00.000Z',
};

describe('journal synchronization', () => {
  it('repairs pending entry mutations created before date tokens were copied to the mutation', () => {
    expect(prepareJournalMutationForSync(entryMutation)).toMatchObject({ dateToken });
  });

  it('preserves a present token so mismatched mutations are still rejected by the server', () => {
    const existing = 'E'.repeat(43);
    expect(prepareJournalMutationForSync({ ...entryMutation, dateToken: existing })).toMatchObject({
      dateToken: existing,
    });
  });
});
