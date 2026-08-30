import {
  canonicalJournalAad,
  ciphertextEnvelopeSchema,
  journalKeyEnvelopeSchema,
  journalMutationSchema,
  opaqueDateTokenSchema,
} from '@naaseh/domain';
import { describe, expect, it } from 'vitest';

const ciphertext = {
  recordKind: 'projection',
  schemaVersion: 1,
  keyVersion: 1,
  iv: 'AAAAAAAAAAAAAAAA',
  ciphertext: 'AAAAAAAAAAAAAAAAAAAAAAAA',
  byteSize: 16,
};

describe('journal ciphertext boundary', () => {
  it('uses deterministic canonical AAD with every routing binding', () => {
    expect(
      canonicalJournalAad({
        ownerId: 'owner',
        recordId: 'entry',
        recordKind: 'projection',
        schemaVersion: 1,
        keyVersion: 2,
        dateToken: 'token',
      }),
    ).toBe('journal|owner|entry|projection|1|2|token');
  });

  it('requires valid envelope and key versions and a 256-bit opaque date token', () => {
    expect(ciphertextEnvelopeSchema.safeParse(ciphertext).success).toBe(true);
    expect(ciphertextEnvelopeSchema.safeParse({ ...ciphertext, keyVersion: 0 }).success).toBe(
      false,
    );
    expect(opaqueDateTokenSchema.safeParse('A'.repeat(43)).success).toBe(true);
    expect(opaqueDateTokenSchema.safeParse('public-date-hash').success).toBe(false);
  });

  it('strictly rejects plaintext journal fields from mutations', () => {
    const mutation = {
      id: '22222222-2222-4222-8222-222222222222',
      entityType: 'journalEntry',
      operation: 'upsert',
      entityId: '11111111-1111-4111-8111-111111111111',
      baseVersion: 0,
      dateToken: 'A'.repeat(43),
      payload: {
        entryId: '11111111-1111-4111-8111-111111111111',
        dateToken: 'A'.repeat(43),
        projection: ciphertext,
        body: { ...ciphertext, recordKind: 'body' },
      },
      createdAt: '2026-08-29T12:00:00.000Z',
    };
    expect(journalMutationSchema.safeParse(mutation).success).toBe(true);
    expect(journalMutationSchema.safeParse({ ...mutation, date: '2026-08-29' }).success).toBe(
      false,
    );
  });

  it('requires both owner and recovery wraps', () => {
    expect(
      journalKeyEnvelopeSchema.safeParse({
        id: 'journal-key',
        ownerId: 'owner',
        version: 1,
        keyVersion: 1,
        ownerWrap: {
          algorithm: 'ARGON2ID-AES-256-GCM',
          salt: 'A'.repeat(22),
          parameters: { memoryKiB: 102400, iterations: 3, parallelism: 1 },
          iv: 'A'.repeat(16),
          ciphertext: 'A'.repeat(24),
        },
        recoveryWrap: {
          algorithm: 'RSA-OAEP-256',
          authority: 'recovery',
          keyVersion: 1,
          ciphertext: 'A'.repeat(128),
        },
        createdAt: '2026-08-29T12:00:00.000Z',
        updatedAt: '2026-08-29T12:00:00.000Z',
      }).success,
    ).toBe(true);
  });
});
