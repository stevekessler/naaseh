import {
  hiddenMemoAad,
  hiddenMemoPayloadV2Schema,
  memoDocumentText,
  plainMemoDocument,
  type HiddenMemoPackage,
  type MemoDocument,
} from '@naaseh/domain';
const enc = new TextEncoder(),
  dec = new TextDecoder(),
  b64 = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v))),
  unb64 = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
export async function createMemoCiphertext(
  taskId: string,
  memoId: string,
  plaintext: string,
  providedDek?: CryptoKey,
) {
  const dek =
    providedDek ??
    (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aad = hiddenMemoAad(taskId, memoId);
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: enc.encode(aad) },
    dek,
    enc.encode(plaintext),
  );
  return { dek, iv: b64(iv), aad, ciphertext: b64(ciphertext) };
}
export async function decryptMemo(
  pkg: Pick<HiddenMemoPackage, 'ciphertext' | 'iv' | 'aad'>,
  dek: CryptoKey,
) {
  return dec.decode(
    await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64(pkg.iv), additionalData: enc.encode(pkg.aad) },
      dek,
      unb64(pkg.ciphertext),
    ),
  );
}
export const exportDek = (key: CryptoKey) => crypto.subtle.exportKey('raw', key);

export async function createRichMemoCiphertext(
  taskId: string,
  memoId: string,
  document: MemoDocument,
  providedDek?: CryptoKey,
) {
  const payload = hiddenMemoPayloadV2Schema.parse({
    version: 2,
    text: memoDocumentText(document),
    document,
  });
  return createMemoCiphertext(taskId, memoId, JSON.stringify(payload), providedDek);
}

export async function decryptMemoPayload(
  pkg: Pick<HiddenMemoPackage, 'ciphertext' | 'iv' | 'aad' | 'version'>,
  dek: CryptoKey,
) {
  const plaintext = await decryptMemo(pkg, dek);
  if (pkg.version === 1) {
    const document = plainMemoDocument(plaintext);
    return { version: 1 as const, text: plaintext, document };
  }
  return hiddenMemoPayloadV2Schema.parse(JSON.parse(plaintext));
}
