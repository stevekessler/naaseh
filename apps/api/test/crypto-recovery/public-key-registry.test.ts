import { GetPublicKeyCommand, SignCommand, type KMSClient } from '@aws-sdk/client-kms';
import { describe, expect, it, vi } from 'vitest';
import { buildPublicKeyRegistry } from '../../src/crypto-recovery/public-key-registry.js';

const metadata = JSON.stringify({
  schema: 'naaseh-recovery-key-registry/v1',
  region: 'us-west-2',
  keys: [
    {
      authority: 'recovery',
      keyId: 'arn:aws:kms:us-west-2:111111111111:key/recovery',
      region: 'us-west-2',
      algorithm: 'RSAES_OAEP_SHA_256',
      version: 1,
      state: 'active',
    },
  ],
});

describe('signed recovery public-key registry', () => {
  it('loads the regional recovery public key and signs the canonical registry digest', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        PublicKey: Uint8Array.from([1]),
        KeySpec: 'RSA_3072',
        KeyUsage: 'ENCRYPT_DECRYPT',
      })
      .mockResolvedValueOnce({ Signature: Uint8Array.from([3]) });
    const result = await buildPublicKeyRegistry(metadata, 'arn:signing', {
      send,
    } as unknown as Pick<KMSClient, 'send'>);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetPublicKeyCommand);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(SignCommand);
    expect(result.region).toBe('us-west-2');
    expect(result.keys.map((key) => key.publicKey)).toEqual(['AQ==']);
    expect(result.signature).toBe('Aw==');
  });

  it('fails closed if the recovery authority has no public key', async () => {
    const send = vi.fn().mockResolvedValue({});
    await expect(
      buildPublicKeyRegistry(metadata, 'arn:signing', { send } as unknown as Pick<
        KMSClient,
        'send'
      >),
    ).rejects.toThrow('unavailable');
  });
});
