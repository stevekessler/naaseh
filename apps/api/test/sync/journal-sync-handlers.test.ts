import { journalPullResponseSchema } from '@naaseh/contracts';
import { describe, expect, it } from 'vitest';
import { InMemoryJournalRepository } from '../../src/journal/journal-repository.js';
import { createJournalSyncHandlers } from '../../src/sync/handlers.js';

const envelope = (recordKind: 'projection' | 'body') => ({
  recordKind,
  schemaVersion: 1,
  keyVersion: 1,
  iv: 'A'.repeat(16),
  ciphertext: 'A'.repeat(24),
  byteSize: 16,
});

describe('journal sync handlers', () => {
  it('does not expose the repository owner field in pull responses', async () => {
    const handlers = createJournalSyncHandlers(new InMemoryJournalRepository());
    const entityId = '11111111-1111-4111-8111-111111111111';
    const dateToken = 'A'.repeat(43);
    await handlers.push('owner', [
      {
        id: crypto.randomUUID(),
        entityType: 'journalEntry',
        operation: 'upsert',
        entityId,
        baseVersion: 0,
        dateToken,
        payload: {
          entryId: entityId,
          dateToken,
          projection: envelope('projection'),
          body: envelope('body'),
        },
        createdAt: new Date().toISOString(),
      },
    ]);

    const response = await handlers.pull('owner', 0);

    expect(journalPullResponseSchema.parse(response).changes).toHaveLength(1);
    expect(response.changes[0]).not.toHaveProperty('ownerId');
  });
});
