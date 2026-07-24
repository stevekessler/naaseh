import { SignCommand, VerifyCommand, type KMSClient } from '@aws-sdk/client-kms';
import { describe, expect, it, vi } from 'vitest';
import {
  backupManifestSchema,
  keyLifecycleSchema,
  recoveryPackageInventorySchema,
} from '../src/backup.js';
import {
  canonicalManifestHash,
  signManifest,
  verifyManifest,
} from '../../../apps/api/src/crypto-recovery/backup-manifest.js';

const content = {
  version: 1 as const,
  region: 'us-west-2' as const,
  manifestId: '01J00000000000000000000000',
  createdAt: '2026-07-23T12:00:00.000Z',
  recoveryPointArn: 'arn:aws:backup:us-west-2:111111111111:recovery-point:daily',
  backupIds: ['arn:aws:backup:us-west-2:111111111111:recovery-point:daily'],
  dataRange: {
    earliestAt: '2026-07-23T11:55:00.000Z',
    latestAt: '2026-07-23T12:00:00.000Z',
  },
  entityCounts: { revisions: 7, tasks: 3 },
  keyVersions: ['memo-primary-v1', 'memo-recovery-v1'],
  recoveryWrapVersions: ['memo-primary-v1', 'memo-recovery-v1'],
  artifactHashes: { configuration: 'b'.repeat(64) },
};

describe('backup manifest integrity', () => {
  it('requires a signed SHA-256 manifest with unique backup and key inventory', () => {
    const manifest = {
      ...content,
      hash: canonicalManifestHash(content),
      signature: Buffer.from('kms-signature').toString('base64'),
    };
    expect(backupManifestSchema.parse(manifest)).toEqual(manifest);
    expect(backupManifestSchema.safeParse({ ...manifest, keyVersions: ['v1', 'v1'] }).success).toBe(
      false,
    );
    expect(backupManifestSchema.safeParse({ ...manifest, hash: 'not-a-digest' }).success).toBe(
      false,
    );
  });

  it('hashes nested object keys canonically and detects inventory changes', () => {
    const reordered = {
      artifactHashes: content.artifactHashes,
      recoveryWrapVersions: content.recoveryWrapVersions,
      keyVersions: content.keyVersions,
      entityCounts: { tasks: 3, revisions: 7 },
      dataRange: {
        latestAt: content.dataRange.latestAt,
        earliestAt: content.dataRange.earliestAt,
      },
      backupIds: content.backupIds,
      recoveryPointArn: content.recoveryPointArn,
      createdAt: content.createdAt,
      manifestId: content.manifestId,
      region: content.region,
      version: content.version,
    };
    expect(canonicalManifestHash(reordered)).toBe(canonicalManifestHash(content));
    expect(
      canonicalManifestHash({ ...content, entityCounts: { revisions: 7, tasks: 4 } }),
    ).not.toBe(canonicalManifestHash(content));
  });

  it('sends digest-only KMS sign and verify commands and honors verification failure', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ Signature: Uint8Array.from([1, 2, 3]) })
      .mockResolvedValueOnce({ SignatureValid: true })
      .mockResolvedValueOnce({ SignatureValid: false });
    const client = { send } as unknown as Pick<KMSClient, 'send'>;

    const signature = await signManifest(content, 'alias/backup-signing', client);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(SignCommand);
    expect(signature).toBe('AQID');
    expect(await verifyManifest(content, signature, 'alias/backup-signing', client)).toBe(true);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(VerifyCommand);
    expect(
      await verifyManifest({ ...content, entityCounts: { tasks: 0 } }, signature, 'key', client),
    ).toBe(false);
  });

  it('rejects incomplete recovery inventories and invalid retirement metadata', () => {
    expect(
      recoveryPackageInventorySchema.safeParse({
        manifestId: 'manifest-1',
        entityCounts: { tasks: 3 },
        requiredKeyVersions: ['v1', 'v2'],
        recoveryWraps: [{ keyVersion: 'v1', authority: 'recovery', kmsKeyId: 'arn:recovery-v1' }],
        verifiedAt: content.createdAt,
      }).success,
    ).toBe(false);
    expect(
      keyLifecycleSchema.safeParse({
        version: 'v1',
        purpose: 'memo-recovery',
        state: 'retired',
        createdAt: content.createdAt,
      }).success,
    ).toBe(false);
  });
});
