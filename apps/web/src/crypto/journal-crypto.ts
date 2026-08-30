import {
  canonicalJournalAad,
  ciphertextEnvelopeSchema,
  type CiphertextEnvelope,
  type JournalAadInput,
} from '@naaseh/domain';
import { derivePinKey, unwrapDekWithPin, wrapDekWithPin } from './pin-wrap.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const toBase64Url = (value: ArrayBuffer | Uint8Array) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
};
const fromBase64Url = (value: string) => {
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

export function generateJournalMasterKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}
async function importJmk(jmk: Uint8Array) {
  return crypto.subtle.importKey('raw', jmk, 'HKDF', false, ['deriveKey']);
}
export async function deriveJournalRecordKey(jmk: Uint8Array, label: string, usages: KeyUsage[]) {
  const base = await importJmk(jmk);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: encoder.encode(label) },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}
async function deriveDateKey(jmk: Uint8Array) {
  const base = await importJmk(jmk);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: encoder.encode('journal:date-identity:v1'),
    },
    base,
    { name: 'HMAC', hash: 'SHA-256', length: 256 },
    false,
    ['sign'],
  );
}
export async function journalDateToken(jmk: Uint8Array, localDate: string): Promise<string> {
  return toBase64Url(
    await crypto.subtle.sign('HMAC', await deriveDateKey(jmk), encoder.encode(localDate)),
  );
}
const labelFor = (input: JournalAadInput) =>
  `journal:${input.recordKind}:v${input.keyVersion}:${input.recordId}`;
export async function encryptJournalRecord(
  value: unknown,
  jmk: Uint8Array,
  input: JournalAadInput,
): Promise<CiphertextEnvelope> {
  const key = await deriveJournalRecordKey(jmk, labelFor(input), ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(canonicalJournalAad(input)) },
    key,
    plaintext,
  );
  return ciphertextEnvelopeSchema.parse({
    recordKind: input.recordKind,
    schemaVersion: input.schemaVersion,
    keyVersion: input.keyVersion,
    iv: toBase64Url(iv),
    ciphertext: toBase64Url(ciphertext),
    byteSize: ciphertext.byteLength,
  });
}
export async function decryptJournalRecord<T>(
  envelope: CiphertextEnvelope,
  jmk: Uint8Array,
  input: JournalAadInput,
): Promise<T> {
  const parsed = ciphertextEnvelopeSchema.parse(envelope);
  const key = await deriveJournalRecordKey(jmk, labelFor(input), ['decrypt']);
  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: fromBase64Url(parsed.iv),
      additionalData: encoder.encode(canonicalJournalAad(input)),
    },
    key,
    fromBase64Url(parsed.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}
export function zeroizeJournalKey(jmk: Uint8Array): void {
  jmk.fill(0);
}

export interface LocalJournalOwnerWrap {
  salt: string;
  iv: string;
  ciphertext: string;
  algorithm: 'ARGON2ID-AES-256-GCM';
  parameters: { memoryKiB: 102_400; iterations: 3; parallelism: 1 };
}
export async function wrapJournalMasterKeyWithPin(
  jmk: Uint8Array,
  pin: string,
): Promise<LocalJournalOwnerWrap> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const pinKey = await derivePinKey(pin, salt);
  const masterKey = await crypto.subtle.importKey('raw', jmk, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
  const wrapped = await wrapDekWithPin(masterKey, pinKey);
  return {
    salt: toBase64Url(salt),
    iv: wrapped.iv,
    ciphertext: wrapped.ciphertext,
    algorithm: 'ARGON2ID-AES-256-GCM',
    parameters: { memoryKiB: 102_400, iterations: 3, parallelism: 1 },
  };
}
export async function unwrapJournalMasterKeyWithPin(
  value: LocalJournalOwnerWrap,
  pin: string,
): Promise<Uint8Array> {
  const pinKey = await derivePinKey(pin, fromBase64Url(value.salt));
  const key = await unwrapDekWithPin(
    { algorithm: 'AES-256-GCM', iv: value.iv, ciphertext: value.ciphertext },
    pinKey,
  );
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}
export async function changeJournalPin(
  value: LocalJournalOwnerWrap,
  oldPin: string,
  newPin: string,
): Promise<LocalJournalOwnerWrap> {
  const jmk = await unwrapJournalMasterKeyWithPin(value, oldPin);
  try {
    return await wrapJournalMasterKeyWithPin(jmk, newPin);
  } finally {
    zeroizeJournalKey(jmk);
  }
}
export async function wrapJournalMasterKeyForRecovery(
  jmk: Uint8Array,
  publicKeySpki: Uint8Array,
  keyVersion: number,
) {
  const publicKey = await crypto.subtle.importKey(
    'spki',
    publicKeySpki,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  return {
    algorithm: 'RSA-OAEP-256' as const,
    authority: 'recovery' as const,
    keyVersion,
    ciphertext: toBase64Url(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, jmk)),
  };
}
