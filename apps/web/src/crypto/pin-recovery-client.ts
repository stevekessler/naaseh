const b64url = (value: ArrayBuffer) => {
  const binary = String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};
const fromB64url = (value: string) => {
  const base64 = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
};

/**
 * The private half never leaves this function. The recovered DEK is imported as
 * a non-extractable browser key before the temporary raw buffer is cleared.
 */
export async function recoverMemoDek(
  taskId: string,
  password: string,
  reason: string,
  csrfToken: string,
): Promise<CryptoKey> {
  if (!navigator.onLine) throw new Error('PIN recovery requires an internet connection.');
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    false,
    ['encrypt', 'decrypt'],
  );
  const publicSpki = await crypto.subtle.exportKey('spki', pair.publicKey);
  const response = await fetch(`/api/v1/tasks/${encodeURIComponent(taskId)}/hidden-memo/recovery`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json', 'x-csrf-token': csrfToken },
    body: JSON.stringify({
      password,
      reason,
      ephemeralPublicKeySpki: b64url(publicSpki),
    }),
  });
  if (!response.ok) throw new Error('PIN recovery could not be completed.');
  const body = (await response.json()) as {
    region?: string;
    authority?: string;
    algorithm?: string;
    encryptedDek?: string;
  };
  if (
    body.region !== 'us-west-2' ||
    body.authority !== 'recovery' ||
    body.algorithm !== 'RSA-OAEP-256' ||
    !body.encryptedDek
  )
    throw new Error('PIN recovery returned an invalid response.');
  const raw = new Uint8Array(
    await crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      pair.privateKey,
      fromB64url(body.encryptedDek),
    ),
  );
  try {
    if (raw.byteLength !== 32) throw new Error('PIN recovery returned an invalid key.');
    return await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, [
      'encrypt',
      'decrypt',
    ]);
  } finally {
    raw.fill(0);
  }
}
