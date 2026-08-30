import type { JournalRecoveryService } from './journal-recovery-service.js';
import { constants, createPublicKey, publicEncrypt } from 'node:crypto';
import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';

export function createJournalRecoveryHandler(service: JournalRecoveryService) {
  return async (event: { action: 'status' | 'consume'; ownerId: string; requestId: string }) => {
    const value =
      event.action === 'consume'
        ? { encryptedJmk: await service.consume(event.ownerId, event.requestId) }
        : await service.ownerStatus(event.ownerId, event.requestId);
    return {
      statusCode: 200,
      headers: { 'cache-control': 'no-store' },
      body: JSON.stringify(value),
    };
  };
}

type KmsSender = Pick<KMSClient, 'send'>;
export async function rewrapJournalJmkForOwner(
  input: { recoveryCiphertext: string; recoveryKeyArn: string; ephemeralPublicKeySpki: string },
  client: KmsSender = new KMSClient({}),
) {
  const ownerKey = createPublicKey({
    key: Buffer.from(input.ephemeralPublicKeySpki, 'base64url'),
    format: 'der',
    type: 'spki',
  });
  if (
    ownerKey.asymmetricKeyType !== 'rsa' ||
    (ownerKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
  )
    throw new Error('Recovery is unavailable.');
  const result = await client.send(
    new DecryptCommand({
      KeyId: input.recoveryKeyArn,
      CiphertextBlob: Buffer.from(input.recoveryCiphertext, 'base64url'),
      EncryptionAlgorithm: 'RSAES_OAEP_SHA_256',
    }),
  );
  if (!result.Plaintext || result.Plaintext.byteLength !== 32)
    throw new Error('Recovery is unavailable.');
  const jmk = new Uint8Array(result.Plaintext);
  try {
    return publicEncrypt(
      { key: ownerKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      jmk,
    ).toString('base64url');
  } finally {
    jmk.fill(0);
  }
}
