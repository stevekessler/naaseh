import type { JournalKeyEnvelope } from '@naaseh/domain';
import { describe, expect, it, vi } from 'vitest';
import { unwrapJournalMasterKeyWithPin } from '../../src/crypto/journal-crypto.js';
import {
  changeDurableJournalPin,
  createDurableJournalEnrollment,
  JournalEnrollmentError,
  restoreDurableJournalEnrollment,
  type JournalEnrollmentDependencies,
} from '../../src/features/journal/journal-enrollment.js';

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
};

async function signedRegistry() {
  const [signing, recovery] = await Promise.all([
    crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    ),
    crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    ),
  ]);
  const unsigned = {
    schema: 'naaseh-recovery-key-registry/v1' as const,
    region: 'us-west-2' as const,
    generatedAt: '2026-08-30T12:00:00.000Z',
    signingKeyId: 'arn:aws:kms:us-west-2:111111111111:key/11111111-1111-4111-8111-111111111111',
    signingPublicKeySpki: Buffer.from(
      await crypto.subtle.exportKey('spki', signing.publicKey),
    ).toString('base64'),
    signingKeySpec: 'RSA_3072' as const,
    signingKeyUsage: 'SIGN_VERIFY' as const,
    keys: [
      {
        authority: 'recovery' as const,
        region: 'us-west-2' as const,
        keyId: 'arn:aws:kms:us-west-2:111111111111:key/22222222-2222-4222-8222-222222222222',
        algorithm: 'RSAES_OAEP_SHA_256' as const,
        version: 1,
        state: 'active' as const,
        publicKey: Buffer.from(await crypto.subtle.exportKey('spki', recovery.publicKey)).toString(
          'base64',
        ),
        keySpec: 'RSA_3072' as const,
        keyUsage: 'ENCRYPT_DECRYPT' as const,
      },
    ],
  };
  return {
    ...unsigned,
    signature: Buffer.from(
      await crypto.subtle.sign(
        { name: 'RSA-PSS', saltLength: 32 },
        signing.privateKey,
        new TextEncoder().encode(JSON.stringify(canonicalize(unsigned))),
      ),
    ).toString('base64'),
  };
}

describe('durable Journal enrollment', () => {
  it('writes and reads back both wraps, restores local enrollment, and durably rotates the PIN', async () => {
    let durable: JournalKeyEnvelope | undefined;
    const saveLocalWrap = vi.fn(async () => undefined);
    const dependencies: JournalEnrollmentDependencies = {
      fetchRegistry: vi.fn(async () => signedRegistry()),
      findEnvelope: vi.fn(async () => durable),
      readEnvelope: vi.fn(async () => {
        if (!durable) throw new Error('missing');
        return durable;
      }),
      writeEnvelope: vi.fn(async (envelope) => {
        durable = envelope;
        return envelope;
      }),
      saveLocalWrap,
      now: () => '2026-08-30T12:00:00.000Z',
    };
    const created = await createDurableJournalEnrollment(
      'owner-1',
      '246810',
      'csrf-token',
      dependencies,
    );
    expect(durable).toMatchObject({
      id: 'journal-key',
      ownerId: 'owner-1',
      version: 1,
      keyVersion: 1,
      ownerWrap: { algorithm: 'ARGON2ID-AES-256-GCM' },
      recoveryWrap: { algorithm: 'RSA-OAEP-256', authority: 'recovery', keyVersion: 1 },
    });
    expect(await unwrapJournalMasterKeyWithPin(durable!.ownerWrap, '246810')).toEqual(created.jmk);
    saveLocalWrap.mockClear();
    await restoreDurableJournalEnrollment('owner-1', dependencies);
    expect(saveLocalWrap).toHaveBeenCalledWith('owner-1', durable!.ownerWrap);

    await changeDurableJournalPin(
      'owner-1',
      durable!.ownerWrap,
      '246810',
      '864200',
      'csrf-token',
      dependencies,
    );
    expect(durable?.version).toBe(2);
    await expect(unwrapJournalMasterKeyWithPin(durable!.ownerWrap, '246810')).rejects.toThrow();
    expect(await unwrapJournalMasterKeyWithPin(durable!.ownerWrap, '864200')).toEqual(created.jmk);
  }, 60_000);

  it('reports the safe pre-persistence stage and zeroizes the generated key', async () => {
    const dependencies = {
      fetchRegistry: vi.fn(async () => {
        throw new Error('response details');
      }),
    } as unknown as JournalEnrollmentDependencies;

    await expect(
      createDurableJournalEnrollment('owner-1', '246810', 'csrf-token', dependencies),
    ).rejects.toMatchObject<JournalEnrollmentError>({
      name: 'JournalEnrollmentError',
      stage: 'registry-load',
      message:
        'Journal creation stopped while loading the recovery-key registry. No enrollment was saved.',
    });
  });
});
