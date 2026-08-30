import { describe, expect, it } from 'vitest';
import { InMemoryJournalRepository } from '../../src/journal/journal-repository.js';
import { JournalService } from '../../src/journal/journal-service.js';

const envelope = (recordKind: 'projection' | 'body') => ({
  recordKind,
  schemaVersion: 1,
  keyVersion: 1,
  iv: 'A'.repeat(16),
  ciphertext: 'A'.repeat(24),
  byteSize: 16,
});
const mutation = (overrides: Record<string, unknown> = {}) => ({
  id: crypto.randomUUID(),
  entityType: 'journalEntry' as const,
  operation: 'upsert' as const,
  entityId: '11111111-1111-4111-8111-111111111111',
  baseVersion: 0,
  dateToken: 'A'.repeat(43),
  payload: {
    entryId: '11111111-1111-4111-8111-111111111111',
    dateToken: 'A'.repeat(43),
    projection: envelope('projection'),
    body: envelope('body'),
  },
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('journal owner service', () => {
  it('creates, reads, updates by exact version, and replays mutations stably', async () => {
    const service = new JournalService(new InMemoryJournalRepository());
    const firstMutation = mutation();
    expect(await service.apply('owner', firstMutation)).toMatchObject({
      status: 'applied',
      version: 1,
    });
    expect(await service.apply('owner', firstMutation)).toMatchObject({
      status: 'alreadyApplied',
      version: 1,
    });
    expect(await service.read('owner', firstMutation.entityId)).toMatchObject({
      ownerId: 'owner',
      version: 1,
    });
    expect(await service.apply('owner', mutation({ baseVersion: 1 }))).toMatchObject({
      status: 'applied',
      version: 2,
    });
    await expect(service.read('other', firstMutation.entityId)).rejects.toThrow('unavailable');
  });

  it('rejects stale versions, duplicate date tokens, delete behavior, and oversized ciphertext', async () => {
    const service = new JournalService(new InMemoryJournalRepository());
    await service.apply('owner', mutation());
    expect(await service.apply('owner', mutation({ baseVersion: 0 }))).toMatchObject({
      status: 'conflict',
    });
    expect(
      await service.apply(
        'owner',
        mutation({
          entityId: '33333333-3333-4333-8333-333333333333',
          payload: { ...mutation().payload, entryId: '33333333-3333-4333-8333-333333333333' },
        }),
      ),
    ).toMatchObject({ status: 'conflict', conflictKind: 'dateToken' });
    await expect(
      service.apply('owner', { ...mutation(), operation: 'delete' } as never),
    ).rejects.toThrow();
    await expect(
      service.apply(
        'owner',
        mutation({
          payload: { ...mutation().payload, body: { ...envelope('body'), byteSize: 307_201 } },
        }),
      ),
    ).rejects.toThrow();
  });
});
