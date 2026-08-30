import { DecryptCommand, KMSClient } from '@aws-sdk/client-kms';
import type { CrisisPlanRecipientGrant } from '@naaseh/domain';

const decoder = new TextDecoder();
const fromBase64Url = (value: string) => Uint8Array.from(Buffer.from(value, 'base64url'));
const toBase64Url = (value: ArrayBuffer | Uint8Array) =>
  Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value)).toString('base64url');
export interface BrokerBinding {
  requestId: string;
  recipientId: string;
  ownerId: string;
  planId: string;
  shareVersion: number;
  keyGeneration: number;
  ephemeralPublicKeySpki: string;
}
export interface BrokerDependencies {
  now(): number;
  currentGrant(binding: BrokerBinding): Promise<CrisisPlanRecipientGrant | undefined>;
  claimRequest(binding: BrokerBinding, expiresAt: number): Promise<boolean>;
  decryptGrant(grant: CrisisPlanRecipientGrant): Promise<Uint8Array>;
}

export class CrisisPlanKeyBroker {
  constructor(private readonly dependencies: BrokerDependencies) {}
  async rewrap(binding: BrokerBinding) {
    const now = this.dependencies.now();
    const grant = await this.dependencies.currentGrant(binding);
    if (!grant) throw new Error('The shared Crisis Plan is unavailable.');
    // The conditional receipt is claimed before KMS work so concurrent invocations and
    // cold starts cannot decrypt the same one-use request more than once.
    const receiptExpiresAt = Math.ceil((now + 120_000) / 1000);
    if (!(await this.dependencies.claimRequest(binding, receiptExpiresAt)))
      throw new Error('The shared Crisis Plan is unavailable.');
    const raw = await this.dependencies.decryptGrant(grant);
    try {
      const value = JSON.parse(decoder.decode(raw)) as {
        ownerId?: string;
        planId?: string;
        recipientId?: string;
        shareVersion?: number;
        keyGeneration?: number;
        cpk?: string;
      };
      if (
        value.ownerId !== binding.ownerId ||
        value.planId !== binding.planId ||
        value.recipientId !== binding.recipientId ||
        value.shareVersion !== binding.shareVersion ||
        value.keyGeneration !== binding.keyGeneration ||
        !value.cpk
      )
        throw new Error('The shared Crisis Plan is unavailable.');
      if (!(await this.dependencies.currentGrant(binding)))
        throw new Error('The shared Crisis Plan is unavailable.');
      const cpk = fromBase64Url(value.cpk);
      if (cpk.byteLength !== 32) throw new Error('The shared Crisis Plan is unavailable.');
      try {
        const publicKey = await crypto.subtle.importKey(
          'spki',
          fromBase64Url(binding.ephemeralPublicKeySpki),
          { name: 'RSA-OAEP', hash: 'SHA-256' },
          false,
          ['encrypt'],
        );
        const wrappedCpk = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, publicKey, cpk);
        return {
          requestId: binding.requestId,
          algorithm: 'RSA-OAEP-256' as const,
          wrappedCpk: toBase64Url(wrappedCpk),
          expiresAt: new Date(now + 60_000).toISOString(),
        };
      } finally {
        cpk.fill(0);
      }
    } finally {
      raw.fill(0);
    }
  }
}

export function kmsGrantDecryptor(keyId: string, client = new KMSClient({})) {
  return async (grant: CrisisPlanRecipientGrant) => {
    const result = await client.send(
      new DecryptCommand({
        KeyId: keyId,
        CiphertextBlob: fromBase64Url(grant.ciphertext),
        EncryptionAlgorithm: 'RSAES_OAEP_SHA_256',
      }),
    );
    if (!result.Plaintext) throw new Error('The shared Crisis Plan is unavailable.');
    return new Uint8Array(result.Plaintext);
  };
}
export const crisisPlanBrokerHeaders = Object.freeze({
  'cache-control': 'no-store, private',
  pragma: 'no-cache',
  'content-type': 'application/json',
});
