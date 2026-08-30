import { GetPublicKeyCommand, KMSClient, SignCommand } from '@aws-sdk/client-kms';

const client = new KMSClient({});
const toBase64Url = (value: Uint8Array) => Buffer.from(value).toString('base64url');
let cached: { value: string; refreshAt: number } | undefined;

/** Publishes only signed public material; private KMS key bytes never leave KMS. */
export async function loadSharingKeyRegistry(now = Date.now): Promise<string> {
  const current = now();
  if (cached && cached.refreshAt > current) return cached.value;
  const sharingKeyId = process.env.CRISIS_PLAN_SHARING_KEY_ID;
  const signingKeyId = process.env.BACKUP_MANIFEST_SIGNING_KEY_ARN;
  if (!sharingKeyId || !signingKeyId) throw new Error('Sharing-key registry is unavailable.');
  const [sharing, signing] = await Promise.all([
    client.send(new GetPublicKeyCommand({ KeyId: sharingKeyId })),
    client.send(new GetPublicKeyCommand({ KeyId: signingKeyId })),
  ]);
  if (!sharing.PublicKey || !signing.PublicKey)
    throw new Error('Sharing-key registry is unavailable.');
  const keyVersion = 1;
  const publicKeySpki = toBase64Url(sharing.PublicKey);
  const expiresAt = new Date(current + 10 * 60_000).toISOString();
  const payload = Buffer.from([keyVersion, publicKeySpki, expiresAt].join('|'));
  const signed = await client.send(
    new SignCommand({
      KeyId: signingKeyId,
      Message: payload,
      MessageType: 'RAW',
      SigningAlgorithm: 'RSASSA_PSS_SHA_256',
    }),
  );
  if (!signed.Signature) throw new Error('Sharing-key registry is unavailable.');
  const value = JSON.stringify({
    keyVersion,
    publicKeySpki,
    signingPublicKeySpki: toBase64Url(signing.PublicKey),
    signingAlgorithm: 'RSA-PSS-SHA256',
    signature: toBase64Url(signed.Signature),
    expiresAt,
  });
  cached = { value, refreshAt: current + 5 * 60_000 };
  return value;
}
