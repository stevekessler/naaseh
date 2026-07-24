const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface Ciphertext {
  iv: string;
  ciphertext: string;
}
const encode = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));
const decode = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

export async function createDeviceKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptText(
  plaintext: string,
  key: CryptoKey,
  associatedData: string,
): Promise<Ciphertext> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(associatedData) },
    key,
    encoder.encode(plaintext),
  );
  return { iv: encode(iv.buffer), ciphertext: encode(ciphertext) };
}

export async function decryptText(
  value: Ciphertext,
  key: CryptoKey,
  associatedData: string,
): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: decode(value.iv), additionalData: encoder.encode(associatedData) },
    key,
    decode(value.ciphertext),
  );
  return decoder.decode(plaintext);
}
