import {
  GetPublicKeyCommand,
  KMSClient,
  MessageType,
  SignCommand,
  SigningAlgorithmSpec,
} from '@aws-sdk/client-kms';
import { z } from 'zod';
import { canonicalManifestHash } from './backup-manifest.js';

const registrySchema = z
  .object({
    schema: z.literal('naaseh-recovery-key-registry/v1'),
    region: z.literal('us-west-2'),
    keys: z
      .array(
        z
          .object({
            authority: z.literal('recovery'),
            region: z.literal('us-west-2'),
            keyId: z.string().min(1),
            algorithm: z.literal('RSAES_OAEP_SHA_256'),
            version: z.number().int().positive(),
            state: z.enum(['active', 'decrypt-only']),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

type KmsSender = Pick<KMSClient, 'send'>;
const kms = new KMSClient({});
let cached: Promise<Awaited<ReturnType<typeof buildPublicKeyRegistry>>> | undefined;

export async function buildPublicKeyRegistry(
  metadataJson = process.env.RECOVERY_PUBLIC_KEY_REGISTRY,
  signingKeyId = process.env.BACKUP_MANIFEST_SIGNING_KEY_ARN,
  client: KmsSender = kms,
) {
  if (!metadataJson || !signingKeyId)
    throw new Error('Recovery public-key registry is unavailable.');
  const metadata = registrySchema.parse(JSON.parse(metadataJson));
  const keys = await Promise.all(
    metadata.keys.map(async (entry) => {
      const result = await client.send(new GetPublicKeyCommand({ KeyId: entry.keyId }));
      if (!result.PublicKey) throw new Error('A recovery public key is unavailable.');
      return {
        ...entry,
        publicKey: Buffer.from(result.PublicKey).toString('base64'),
        keySpec: result.KeySpec,
        keyUsage: result.KeyUsage,
      };
    }),
  );
  const unsigned = {
    schema: metadata.schema,
    region: metadata.region,
    generatedAt: new Date().toISOString(),
    signingKeyId,
    keys,
  };
  const digest = Buffer.from(canonicalManifestHash(unsigned), 'hex');
  const signed = await client.send(
    new SignCommand({
      KeyId: signingKeyId,
      Message: digest,
      MessageType: MessageType.DIGEST,
      SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    }),
  );
  if (!signed.Signature) throw new Error('Recovery public-key registry signature is unavailable.');
  return { ...unsigned, signature: Buffer.from(signed.Signature).toString('base64') };
}

export function loadPublicKeyRegistry() {
  cached ??= buildPublicKeyRegistry();
  return cached;
}

export function clearPublicKeyRegistryCacheForTest() {
  cached = undefined;
}
