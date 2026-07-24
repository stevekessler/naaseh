import {
  backupManifestContentSchema,
  backupManifestSchema,
  restoreEvidenceSchema,
  type BackupManifest,
  type BackupManifestContent,
  type RestoreEvidence,
} from '@naaseh/domain';
import { putRecord } from '../shared/store.js';
import { canonicalManifestHash, signManifest, verifyManifest } from './backup-manifest.js';
import { z } from 'zod';

export type ManifestSigner = (value: unknown, keyId: string) => Promise<string>;
export type ManifestVerifier = (
  value: unknown,
  signature: string,
  keyId: string,
) => Promise<boolean>;

export interface ManifestEvidenceStore {
  putManifest(manifest: BackupManifest): Promise<void>;
  putRestoreEvidence(manifestId: string, evidence: RestoreEvidence): Promise<void>;
}

const manifestInventoryInputSchema = z
  .object({
    version: z.literal(1),
    manifestId: z.string().min(1),
    createdAt: z.string().datetime(),
    recoveryPointArn: z.string().min(1),
    region: z.literal('us-west-2'),
    backupIds: z.array(z.string().min(1)).min(1),
    entities: z
      .array(
        z
          .object({
            entityType: z.string().regex(/^[A-Za-z][A-Za-z0-9-]{0,63}$/),
            updatedAt: z.string().datetime(),
          })
          .strict(),
      )
      .min(1),
    keyVersions: z.array(z.string().min(1)).min(1),
    recoveryWraps: z
      .array(
        z
          .object({
            keyVersion: z.string().min(1),
            authority: z.literal('recovery'),
          })
          .strict(),
      )
      .min(1),
    artifactHashes: z.record(z.string().regex(/^[a-f0-9]{64}$/)),
  })
  .strict();

export type ManifestInventoryInput = z.input<typeof manifestInventoryInputSchema>;

/**
 * Build the signed-manifest payload from content-free inventory rows. Accepting only entity
 * type and timestamp prevents task or memo values from entering recovery evidence.
 */
export function buildManifestContentFromInventory(
  value: ManifestInventoryInput,
): BackupManifestContent {
  const input = manifestInventoryInputSchema.parse(value);
  assertRecoveryInventory(input.keyVersions, input.recoveryWraps);
  const timestamps = input.entities.map((entity) => entity.updatedAt).sort();
  const entityCounts = input.entities.reduce<Record<string, number>>((counts, entity) => {
    counts[entity.entityType] = (counts[entity.entityType] ?? 0) + 1;
    return counts;
  }, {});
  const keyVersions = [...new Set(input.keyVersions)].sort();
  return backupManifestContentSchema.parse({
    version: input.version,
    manifestId: input.manifestId,
    createdAt: input.createdAt,
    recoveryPointArn: input.recoveryPointArn,
    region: input.region,
    backupIds: [...new Set(input.backupIds)].sort(),
    dataRange: { earliestAt: timestamps[0]!, latestAt: timestamps.at(-1)! },
    entityCounts: Object.fromEntries(Object.entries(entityCounts).sort()),
    keyVersions,
    recoveryWrapVersions: [...new Set(input.recoveryWraps.map((wrap) => wrap.keyVersion))].sort(),
    artifactHashes: input.artifactHashes,
  });
}

export const dynamoManifestEvidenceStore: ManifestEvidenceStore = {
  async putManifest(manifest) {
    await putRecord(
      {
        PK: `BACKUP#${manifest.manifestId}`,
        SK: 'MANIFEST',
        entityCounts: manifest.entityCounts,
        keyVersions: manifest.keyVersions,
        createdAt: manifest.createdAt,
        data: manifest,
      },
      'attribute_not_exists(PK)',
    );
  },
  async putRestoreEvidence(manifestId, evidence) {
    await putRecord(
      {
        PK: `BACKUP#${manifestId}`,
        SK: `EVIDENCE#${evidence.completedAt}`,
        rpoSeconds: evidence.rpoSeconds,
        rtoSeconds: evidence.rtoSeconds,
        authorizationPassed: evidence.authorizationPassed,
        decryptPassed: evidence.decryptPassed,
        data: evidence,
      },
      'attribute_not_exists(PK)',
    );
  },
};

export function buildUnsignedManifest(input: BackupManifestContent) {
  const content = backupManifestContentSchema.parse(input);
  return { ...content, hash: canonicalManifestHash(content) };
}

export async function createAndStoreManifest(
  input: BackupManifestContent,
  signingKeyId: string,
  options: {
    signer?: ManifestSigner;
    store?: ManifestEvidenceStore;
  } = {},
): Promise<BackupManifest> {
  const unsigned = buildUnsignedManifest(input);
  const signature = await (options.signer ?? signManifest)(unsigned, signingKeyId);
  const manifest = backupManifestSchema.parse({ ...unsigned, signature });
  await (options.store ?? dynamoManifestEvidenceStore).putManifest(manifest);
  return manifest;
}

export async function verifyStoredManifest(
  manifest: BackupManifest,
  signingKeyId: string,
  verifier: ManifestVerifier = verifyManifest,
): Promise<boolean> {
  const parsed = backupManifestSchema.parse(manifest);
  const { signature, hash, ...content } = parsed;
  if (canonicalManifestHash(content) !== hash) return false;
  return verifier({ ...content, hash }, signature, signingKeyId);
}

export async function recordRestoreEvidence(
  manifestId: string,
  value: RestoreEvidence,
  store: ManifestEvidenceStore = dynamoManifestEvidenceStore,
) {
  const evidence = restoreEvidenceSchema.parse(value);
  await store.putRestoreEvidence(manifestId, evidence);
  return evidence;
}

export type RecoveryWrapInventoryItem = {
  keyVersion: string;
  authority: 'recovery';
};

export function assertRecoveryInventory(keyVersions: string[], wraps: RecoveryWrapInventoryItem[]) {
  const required = [...new Set(keyVersions)];
  const requiredSet = new Set(required);
  const seen = new Set<string>();
  for (const wrap of wraps) {
    if (!requiredSet.has(wrap.keyVersion))
      throw new Error('Recovery package contains an unregistered key version.');
    const identity = `${wrap.keyVersion}:${wrap.authority}`;
    if (seen.has(identity))
      throw new Error('Recovery package contains a duplicate authority wrap.');
    seen.add(identity);
  }
  const missing = required.flatMap((version) =>
    !seen.has(`${version}:recovery`) ? [`${version}:recovery`] : [],
  );
  if (missing.length) throw new Error('Recovery package incomplete for one or more key versions.');
}
