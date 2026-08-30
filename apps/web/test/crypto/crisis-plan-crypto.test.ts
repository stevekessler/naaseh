import { describe, expect, it } from 'vitest';
import {
  createOneUseRecipientKeyPair,
  createRecipientCpkGrant,
  decryptCrisisPlanBody,
  encryptCrisisPlanBody,
  generateCrisisPlanContentKey,
  unwrapBrokerCpk,
  unwrapCrisisPlanKeyForOwner,
  verifySharingKeyRegistry,
  wrapCrisisPlanKeyForOwner,
  zeroizeCrisisPlanKey,
} from '../../src/crypto/crisis-plan-crypto.js';
import { generateJournalMasterKey } from '../../src/crypto/journal-crypto.js';

describe('Crisis Plan browser cryptography', () => {
  it('generates random 256-bit CPKs and round-trips only through the owner JMK wrap', async () => {
    const cpk = generateCrisisPlanContentKey();
    const other = generateCrisisPlanContentKey();
    const jmk = generateJournalMasterKey();
    expect(cpk).toHaveLength(32);
    expect(cpk).not.toEqual(other);
    const input = {
      ownerId: 'owner',
      planId: '11111111-1111-4111-8111-111111111111',
      keyGeneration: 1,
    };
    const wrap = await wrapCrisisPlanKeyForOwner(cpk, jmk, input);
    expect(await unwrapCrisisPlanKeyForOwner(wrap, jmk, input)).toEqual(cpk);
    await expect(
      unwrapCrisisPlanKeyForOwner(wrap, generateJournalMasterKey(), input),
    ).rejects.toThrow();
  });

  it('uses fresh AES-GCM nonces, binds metadata, excludes plaintext, and rejects tampering', async () => {
    const cpk = generateCrisisPlanContentKey();
    const input = {
      ownerId: 'owner',
      planId: '11111111-1111-4111-8111-111111111111',
      keyGeneration: 1,
    };
    const value = {
      version: 1,
      blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Call my trusted person' }] }],
    };
    const first = await encryptCrisisPlanBody(value, cpk, input);
    const second = await encryptCrisisPlanBody(value, cpk, input);
    expect(first.iv).not.toBe(second.iv);
    expect(JSON.stringify(first)).not.toContain('trusted person');
    await expect(decryptCrisisPlanBody(first, cpk, input)).resolves.toEqual(value);
    await expect(
      decryptCrisisPlanBody(first, cpk, { ...input, ownerId: 'other' }),
    ).rejects.toThrow();
    zeroizeCrisisPlanKey(cpk);
    expect(cpk.every((byte) => byte === 0)).toBe(true);
  });

  it('verifies the signed registry and identity-binds recipient grants', async () => {
    const signing = await crypto.subtle.generateKey(
      {
        name: 'RSA-PSS',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['sign', 'verify'],
    );
    const sharing = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 3072,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt'],
    );
    const encode = (value: ArrayBuffer) => Buffer.from(value).toString('base64url');
    const publicKeySpki = encode(await crypto.subtle.exportKey('spki', sharing.publicKey));
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    const payload = new TextEncoder().encode([1, publicKeySpki, expiresAt].join('|'));
    const signature = encode(
      await crypto.subtle.sign({ name: 'RSA-PSS', saltLength: 32 }, signing.privateKey, payload),
    );
    const signingPublicKeySpki = encode(await crypto.subtle.exportKey('spki', signing.publicKey));
    const registry = {
      keyVersion: 1,
      publicKeySpki,
      signingPublicKeySpki,
      signingAlgorithm: 'RSA-PSS-SHA256' as const,
      signature,
      expiresAt,
    };
    expect(
      await verifySharingKeyRegistry(
        registry,
        new Uint8Array(await crypto.subtle.exportKey('spki', signing.publicKey)),
      ),
    ).toBe(true);
    const cpk = generateCrisisPlanContentKey();
    const grant = await createRecipientCpkGrant(
      cpk,
      new Uint8Array(await crypto.subtle.exportKey('spki', sharing.publicKey)),
      {
        ownerId: 'owner',
        planId:
          '11111111-1111-4111-8111-111111111111' as import('@naaseh/domain').CrisisPlanRecord['planId'],
        recipientId: 'recipient',
        shareVersion: 1,
        keyGeneration: 1,
        sharingKeyVersion: 1,
      },
    );
    const decrypted = JSON.parse(
      new TextDecoder().decode(
        await crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          sharing.privateKey,
          Buffer.from(grant.ciphertext, 'base64url'),
        ),
      ),
    );
    expect(decrypted).toMatchObject({
      ownerId: 'owner',
      recipientId: 'recipient',
      keyGeneration: 1,
    });
    const oneUse = await createOneUseRecipientKeyPair();
    const ephemeralPublic = await crypto.subtle.importKey(
      'spki',
      Buffer.from(oneUse.publicKeySpki, 'base64url'),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    const wrapped = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, ephemeralPublic, cpk);
    expect(
      await unwrapBrokerCpk(Buffer.from(wrapped).toString('base64url'), oneUse.privateKey),
    ).toEqual(cpk);
  }, 30_000);
});
