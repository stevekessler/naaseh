import { describe, expect, it, vi } from 'vitest';
import {
  changeJournalPin,
  decryptJournalRecord,
  deriveJournalRecordKey,
  encryptJournalRecord,
  generateJournalMasterKey,
  journalDateToken,
  unwrapJournalMasterKeyWithPin,
  wrapJournalMasterKeyForRecovery,
  wrapJournalMasterKeyWithPin,
} from '../../src/crypto/journal-crypto.js';
import { JournalUnlockSession } from '../../src/crypto/journal-unlock-session.js';

describe('journal browser cryptography', () => {
  it('generates a random 256-bit JMK and domain-separated record keys', async () => {
    const first = generateJournalMasterKey();
    const second = generateJournalMasterKey();
    expect(first).toHaveLength(32);
    expect(second).not.toEqual(first);
    const projection = await deriveJournalRecordKey(first, 'journal:projection:v1:entry-1', [
      'encrypt',
    ]);
    const body = await deriveJournalRecordKey(first, 'journal:body:v1:entry-1', ['encrypt']);
    expect(projection.extractable).toBe(false);
    expect(body.extractable).toBe(false);
    expect(projection).not.toBe(body);
  });

  it('uses fresh AES-GCM IVs, canonical AAD, and rejects tampering', async () => {
    const jmk = generateJournalMasterKey();
    const input = {
      ownerId: 'owner',
      recordId: 'entry',
      recordKind: 'body' as const,
      schemaVersion: 1,
      keyVersion: 1,
      dateToken: 'A'.repeat(43),
    };
    const first = await encryptJournalRecord({ hello: 'private' }, jmk, input);
    const second = await encryptJournalRecord({ hello: 'private' }, jmk, input);
    expect(first.iv).not.toBe(second.iv);
    await expect(decryptJournalRecord(first, jmk, input)).resolves.toEqual({ hello: 'private' });
    await expect(
      decryptJournalRecord(first, jmk, { ...input, ownerId: 'other' }),
    ).rejects.toThrow();
  });

  it('creates stable opaque date tokens and expires unlocks after five minutes', async () => {
    const jmk = generateJournalMasterKey();
    expect(await journalDateToken(jmk, '2026-08-29')).toBe(
      await journalDateToken(jmk, '2026-08-29'),
    );
    expect(await journalDateToken(jmk, '2026-08-29')).not.toContain('2026');
    vi.useFakeTimers();
    const session = new JournalUnlockSession();
    await session.unlock('owner', jmk);
    expect(session.get('owner')).toBeDefined();
    await vi.advanceTimersByTimeAsync(300_001);
    expect(session.get('owner')).toBeUndefined();
    vi.useRealTimers();
  });

  it('uses Argon2id owner wraps, supports PIN replacement, and wraps only to the recovery public key', async () => {
    const jmk = generateJournalMasterKey();
    const ownerWrap = await wrapJournalMasterKeyWithPin(jmk, '246810');
    expect(ownerWrap).toMatchObject({
      algorithm: 'ARGON2ID-AES-256-GCM',
      parameters: { memoryKiB: 102400, iterations: 3, parallelism: 1 },
    });
    expect(await unwrapJournalMasterKeyWithPin(ownerWrap, '246810')).toEqual(jmk);
    const replacement = await changeJournalPin(ownerWrap, '246810', '864200');
    await expect(unwrapJournalMasterKeyWithPin(replacement, '246810')).rejects.toThrow();
    expect(await unwrapJournalMasterKeyWithPin(replacement, '864200')).toEqual(jmk);
    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );
    const recovery = await wrapJournalMasterKeyForRecovery(
      jmk,
      new Uint8Array(await crypto.subtle.exportKey('spki', keyPair.publicKey)),
      1,
    );
    expect(recovery).toMatchObject({
      algorithm: 'RSA-OAEP-256',
      authority: 'recovery',
      keyVersion: 1,
    });
  }, 30_000);
});
