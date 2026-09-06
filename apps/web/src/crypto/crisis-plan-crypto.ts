import {
  canonicalCrisisPlanAad,
  crisisPlanCiphertextSchema,
  crisisPlanOwnerWrapSchema,
  type CrisisPlanCiphertext,
  type CrisisPlanOwnerWrap,
  type CrisisPlanRecipientGrant,
} from '@naaseh/domain';
import { deriveJournalRecordKey } from './journal-crypto.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64Url = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
};
const fromBase64Url = (value: string) =>
  Uint8Array.from(
    atob(
      value
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '='),
    ),
    (character) => character.charCodeAt(0),
  );

export function generateCrisisPlanContentKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
export function zeroizeCrisisPlanKey(cpk: Uint8Array): void {
  cpk.fill(0);
}

async function importCpk(cpk: Uint8Array, usages: KeyUsage[]) {
  return crypto.subtle.importKey('raw', cpk, { name: 'AES-GCM' }, false, usages);
}

export async function encryptCrisisPlanBody(
  value: unknown,
  cpk: Uint8Array,
  input: { ownerId: string; planId: string; keyGeneration: number },
): Promise<CrisisPlanCiphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
      additionalData: encoder.encode(
        canonicalCrisisPlanAad(input.ownerId, input.planId, input.keyGeneration),
      ),
    },
    await importCpk(cpk, ['encrypt']),
    plaintext,
  );
  return crisisPlanCiphertextSchema.parse({
    algorithm: 'AES-256-GCM',
    schemaVersion: 1,
    keyGeneration: input.keyGeneration,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
    byteSize: ciphertext.byteLength,
  });
}

export async function decryptCrisisPlanBody<T>(
  envelope: CrisisPlanCiphertext,
  cpk: Uint8Array,
  input: { ownerId: string; planId: string; keyGeneration: number },
): Promise<T> {
  const parsed = crisisPlanCiphertextSchema.parse(envelope);
  if (parsed.keyGeneration !== input.keyGeneration)
    throw new Error('The Crisis Plan key generation is not supported.');
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(parsed.iv),
      additionalData: encoder.encode(
        canonicalCrisisPlanAad(input.ownerId, input.planId, input.keyGeneration),
      ),
    },
    await importCpk(cpk, ['decrypt']),
    fromBase64Url(parsed.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export async function wrapCrisisPlanKeyForOwner(
  cpk: Uint8Array,
  jmk: Uint8Array,
  input: { ownerId: string; planId: string; keyGeneration: number },
): Promise<CrisisPlanOwnerWrap> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveJournalRecordKey(
    jmk,
    `crisis-plan:owner-wrap:${input.planId}:v${input.keyGeneration}`,
    ['encrypt'],
  );
  const aad = encoder.encode(
    ['crisis-plan-owner-wrap', input.ownerId, input.planId, input.keyGeneration].join('|'),
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad },
    key,
    cpk,
  );
  return crisisPlanOwnerWrapSchema.parse({
    algorithm: 'JMK-HKDF-AES-256-GCM',
    keyGeneration: input.keyGeneration,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
  });
}

export async function unwrapCrisisPlanKeyForOwner(
  wrap: CrisisPlanOwnerWrap,
  jmk: Uint8Array,
  input: { ownerId: string; planId: string; keyGeneration: number },
): Promise<Uint8Array> {
  const parsed = crisisPlanOwnerWrapSchema.parse(wrap);
  if (parsed.keyGeneration !== input.keyGeneration)
    throw new Error('The Crisis Plan key generation is not supported.');
  const key = await deriveJournalRecordKey(
    jmk,
    `crisis-plan:owner-wrap:${input.planId}:v${input.keyGeneration}`,
    ['decrypt'],
  );
  const aad = encoder.encode(
    ['crisis-plan-owner-wrap', input.ownerId, input.planId, input.keyGeneration].join('|'),
  );
  return new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(parsed.iv), additionalData: aad },
      key,
      fromBase64Url(parsed.ciphertext),
    ),
  );
}

export interface SharingKeyRegistryEntry {
  keyVersion: number;
  publicKeySpki: string;
  signingPublicKeySpki: string;
  signingAlgorithm: 'RSA-PSS-SHA256';
  signature: string;
  expiresAt: string;
}
export async function verifySharingKeyRegistry(
  entry: SharingKeyRegistryEntry,
  signingPublicKeySpki: Uint8Array = fromBase64Url(entry.signingPublicKeySpki),
): Promise<boolean> {
  if (Date.parse(entry.expiresAt) <= Date.now()) return false;
  const key = await crypto.subtle.importKey(
    'spki',
    signingPublicKeySpki,
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const payload = encoder.encode(
    [entry.keyVersion, entry.publicKeySpki, entry.expiresAt].join('|'),
  );
  return crypto.subtle.verify(
    { name: 'RSA-PSS', saltLength: 32 },
    key,
    fromBase64Url(entry.signature),
    payload,
  );
}

export async function createRecipientCpkGrant(
  cpk: Uint8Array,
  sharingPublicKeySpki: Uint8Array,
  binding: {
    ownerId: string;
    planId: CrisisPlanRecipientGrant['planId'];
    recipientId: string;
    shareVersion: number;
    keyGeneration: number;
    sharingKeyVersion: number;
  },
): Promise<CrisisPlanRecipientGrant> {
  const key = await crypto.subtle.importKey(
    'spki',
    sharingPublicKeySpki,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  const payload = encoder.encode(JSON.stringify({ ...binding, cpk: toBase64Url(cpk) }));
  return {
    algorithm: 'RSA-OAEP-256' as const,
    ...binding,
    ciphertext: toBase64Url(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, key, payload)),
  };
}

export async function createOneUseRecipientKeyPair() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 3072,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['encrypt', 'decrypt'],
  );
  const privateBytes = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  try {
    return {
      publicKeySpki: toBase64Url(await crypto.subtle.exportKey('spki', pair.publicKey)),
      privateKey: await crypto.subtle.importKey(
        'pkcs8',
        privateBytes,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['decrypt'],
      ),
    };
  } finally {
    privateBytes.fill(0);
  }
}

export async function unwrapBrokerCpk(
  wrappedCpk: string,
  privateKey: CryptoKey,
): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: 'RSA-OAEP' }, privateKey, fromBase64Url(wrappedCpk)),
  );
}
