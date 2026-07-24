const bytes = (value: string) =>
  Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
const b64 = (value: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(value)));

export interface RecoveryPublicKey {
  authority: 'recovery';
  region: 'us-west-2';
  version: string;
  spki: string;
  signature: string;
  state: 'active';
}

export async function wrapForRecovery(
  rawDek: ArrayBuffer,
  key: RecoveryPublicKey,
  verifyRegistry: (key: RecoveryPublicKey) => Promise<boolean>,
) {
  if (key.authority !== 'recovery' || key.region !== 'us-west-2' || key.state !== 'active')
    throw new Error('An active us-west-2 recovery key is required.');
  if (!(await verifyRegistry(key))) throw new Error('Recovery key registry signature is invalid.');
  const publicKey = await crypto.subtle.importKey(
    'spki',
    bytes(key.spki),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt'],
  );
  return {
    keyVersion: key.version,
    authority: key.authority,
    kmsRegion: key.region,
    algorithm: 'RSA-OAEP-256' as const,
    ciphertext: b64(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, rawDek)),
  };
}
