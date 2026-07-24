import { createHash } from 'node:crypto';
import {
  KMSClient,
  MessageType,
  SignCommand,
  SigningAlgorithmSpec,
  VerifyCommand,
} from '@aws-sdk/client-kms';

type KmsSender = Pick<KMSClient, 'send'>;

export type EnhancedRecoveryRow = { PK?: unknown; SK?: unknown; data?: unknown };
export const enhancedRecoveryEntityNames = [
  'lists',
  'listitems',
  'directoryitems',
  'attachments',
  'attachmentblobs',
  'blobreferences',
  'copyjobs',
  'exportjobs',
] as const;

export function validateEnhancedRecoveryRows(rows: readonly EnhancedRecoveryRow[]) {
  const current = new Map(
    rows
      .filter((row) => row.SK === 'CURRENT' && typeof row.PK === 'string')
      .map((row) => [row.PK as string, row.data as Record<string, unknown> | undefined]),
  );
  const references = new Set(
    rows
      .filter(
        (row) =>
          typeof row.PK === 'string' && typeof row.SK === 'string' && row.SK.startsWith('REF#'),
      )
      .map((row) => `${row.PK}:${row.SK}`),
  );
  for (const [pk, data] of current) {
    if (pk.startsWith('LISTITEM#')) {
      const listId = data?.listId;
      if (typeof listId !== 'string' || !current.has(`LIST#${listId}`))
        throw new Error('Restored list item references a missing list.');
    }
    if (pk.startsWith('ATTACHMENT#')) {
      const blobId = data?.blobId;
      const attachmentId = data?.id;
      if (typeof blobId !== 'string' || !current.has(`BLOB#${blobId}`))
        throw new Error('Restored attachment references a missing blob.');
      if (
        data?.status !== 'deleted' &&
        (typeof attachmentId !== 'string' || !references.has(`BLOB#${blobId}:REF#${attachmentId}`))
      )
        throw new Error('Restored attachment is missing its blob reference.');
      const blob = current.get(`BLOB#${blobId}`);
      if (
        data?.status === 'available' &&
        (blob?.lifecycle !== 'clean' || blob.scanStatus !== 'clean')
      )
        throw new Error('Restored available attachment is not backed by a clean blob.');
    }
    if (pk.startsWith('BLOB#') && data?.lifecycle !== 'deleted') {
      if (typeof data?.objectKey !== 'string' || !data.objectKey.startsWith('attachments/'))
        throw new Error('Restored attachment blob has an invalid object key.');
      if (typeof data?.objectVersionId !== 'string' || !data.objectVersionId)
        throw new Error('Restored attachment blob is missing its exact S3 version.');
    }
    if (pk.startsWith('EXPORTJOB#') && data?.status === 'ready' && !data.manifest)
      throw new Error('Restored ready export is missing its verified manifest.');
  }
  return { currentRecords: current.size, blobReferences: references.size };
}

const kms = new KMSClient({});

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  return value;
}

export function canonicalManifestHash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalize(value)))
    .digest('hex');
}

export async function signManifest(value: unknown, keyId: string, client: KmsSender = kms) {
  const digest = Buffer.from(canonicalManifestHash(value), 'hex');
  const result = await client.send(
    new SignCommand({
      KeyId: keyId,
      Message: digest,
      MessageType: MessageType.DIGEST,
      SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    }),
  );
  if (!result.Signature) throw new Error('Manifest signature unavailable.');
  return Buffer.from(result.Signature).toString('base64');
}

export async function verifyManifest(
  value: unknown,
  signature: string,
  keyId: string,
  client: KmsSender = kms,
) {
  const result = await client.send(
    new VerifyCommand({
      KeyId: keyId,
      Message: Buffer.from(canonicalManifestHash(value), 'hex'),
      MessageType: MessageType.DIGEST,
      Signature: Buffer.from(signature, 'base64'),
      SigningAlgorithm: SigningAlgorithmSpec.RSASSA_PSS_SHA_256,
    }),
  );
  return Boolean(result.SignatureValid);
}
