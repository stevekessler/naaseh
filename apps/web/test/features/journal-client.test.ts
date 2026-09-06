import type { JournalKeyEnvelope } from '@naaseh/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeJournalKeyEnvelope } from '../../src/features/journal/journal-client.js';

const envelope: JournalKeyEnvelope = {
  id: 'journal-key',
  ownerId: 'owner-1',
  version: 1,
  keyVersion: 1,
  ownerWrap: {
    algorithm: 'ARGON2ID-AES-256-GCM',
    salt: 'A'.repeat(22),
    parameters: { memoryKiB: 102_400, iterations: 3, parallelism: 1 },
    iv: 'B'.repeat(16),
    ciphertext: 'C'.repeat(24),
  },
  recoveryWrap: {
    algorithm: 'RSA-OAEP-256',
    authority: 'recovery',
    keyVersion: 1,
    ciphertext: 'D'.repeat(128),
  },
  createdAt: '2026-08-30T12:00:00.000Z',
  updatedAt: '2026-08-30T12:00:00.000Z',
};

describe('Journal enrollment client', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes the complete envelope with credentials, no-store, and CSRF', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(envelope), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(writeJournalKeyEnvelope(envelope, 'csrf-token')).resolves.toEqual(envelope);
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/journal/key-envelope',
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        cache: 'no-store',
        headers: {
          'content-type': 'application/json',
          'x-csrf-token': 'csrf-token',
        },
        body: JSON.stringify(envelope),
      }),
    );
  });
});
