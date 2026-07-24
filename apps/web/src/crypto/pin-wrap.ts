import { argon2id } from 'hash-wasm';

const PIN_MEMORY_KIB = 102_400;
const PIN_ITERATIONS = 3;
const MIN_PIN_LENGTH = 6;

const b64 = (value: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(value)));
const unb64 = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

export interface PinWrappedDek {
  version?: string;
  algorithm: 'AES-256-GCM';
  iv: string;
  ciphertext: string;
}

export function validatePin(pin: string) {
  if (!new RegExp(`^[0-9]{${MIN_PIN_LENGTH},32}$`).test(pin))
    throw new Error('PINs must contain 6 to 32 digits.');
}

export async function derivePinKey(pin: string, salt: Uint8Array) {
  validatePin(pin);
  if (salt.byteLength < 16) throw new Error('PIN salts must be at least 16 bytes.');
  const raw = await argon2id({
    password: pin,
    salt,
    parallelism: 1,
    iterations: PIN_ITERATIONS,
    memorySize: PIN_MEMORY_KIB,
    hashLength: 32,
    outputType: 'binary',
  });
  try {
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
      'wrapKey',
      'unwrapKey',
    ]);
  } finally {
    raw.fill(0);
  }
}

export async function wrapDekWithPin(dek: CryptoKey, pinKey: CryptoKey): Promise<PinWrappedDek> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.wrapKey('raw', dek, pinKey, { name: 'AES-GCM', iv });
  return { algorithm: 'AES-256-GCM', iv: b64(iv), ciphertext: b64(ciphertext) };
}

export async function unwrapDekWithPin(value: PinWrappedDek, pinKey: CryptoKey) {
  return crypto.subtle.unwrapKey(
    'raw',
    unb64(value.ciphertext),
    pinKey,
    { name: 'AES-GCM', iv: unb64(value.iv) },
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
}

/** Rewrap only the DEK; memo ciphertext is never decrypted during a PIN change. */
export async function rewrapDekForPinChange(
  value: PinWrappedDek,
  oldPin: string,
  oldSalt: Uint8Array,
  newPin: string,
  newVersion: string,
) {
  validatePin(newPin);
  const oldKey = await derivePinKey(oldPin, oldSalt);
  const dek = await unwrapDekWithPin(value, oldKey);
  const newSalt = crypto.getRandomValues(new Uint8Array(16));
  const newKey = await derivePinKey(newPin, newSalt);
  const wrapped = await wrapDekWithPin(dek, newKey);
  return { version: newVersion, salt: b64(newSalt), ...wrapped };
}

export const decodePinSalt = unb64;
