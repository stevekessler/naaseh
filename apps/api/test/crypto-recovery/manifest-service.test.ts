import type { BackupManifestContent, RestoreEvidence } from '@naaseh/domain';
import { describe, expect, it, vi } from 'vitest';
import {
  buildManifestContentFromInventory,
  createAndStoreManifest,
  recordRestoreEvidence,
  verifyStoredManifest,
  type ManifestEvidenceStore,
} from '../../src/crypto-recovery/manifest-service.js';

const content: BackupManifestContent = {
  version: 1,
  region: 'us-west-2',
  manifestId: '01J00000000000000000000000',
  createdAt: '2026-07-23T12:00:00.000Z',
  recoveryPointArn: 'arn:aws:backup:us-west-2:111111111111:recovery-point:daily',
  backupIds: ['daily'],
  dataRange: {
    earliestAt: '2026-07-23T11:55:00.000Z',
    latestAt: '2026-07-23T12:00:00.000Z',
  },
  entityCounts: { tasks: 10, revisions: 18 },
  keyVersions: ['memo-v1', 'memo-v2'],
  recoveryWrapVersions: ['memo-v1', 'memo-v2'],
  artifactHashes: { configuration: 'a'.repeat(64) },
};

function memoryStore() {
  const manifests: unknown[] = [];
  const evidence: unknown[] = [];
  const store: ManifestEvidenceStore = {
    putManifest: vi.fn(async (value) => {
      manifests.push(value);
    }),
    putRestoreEvidence: vi.fn(async (_manifestId, value) => {
      evidence.push(value);
    }),
  };
  return { store, manifests, evidence };
}

describe('backup manifest service', () => {
  it('derives counts, range, and complete regional recovery inventory from safe metadata', () => {
    expect(
      buildManifestContentFromInventory({
        version: 1,
        region: 'us-west-2',
        manifestId: content.manifestId,
        createdAt: content.createdAt,
        recoveryPointArn: content.recoveryPointArn,
        backupIds: content.backupIds,
        entities: [
          { entityType: 'tasks', updatedAt: '2026-07-23T11:58:00.000Z' },
          { entityType: 'tasks', updatedAt: '2026-07-23T12:00:00.000Z' },
          { entityType: 'revisions', updatedAt: '2026-07-23T11:55:00.000Z' },
        ],
        keyVersions: ['memo-v2', 'memo-v1'],
        recoveryWraps: [
          { keyVersion: 'memo-v1', authority: 'recovery' },
          { keyVersion: 'memo-v2', authority: 'recovery' },
        ],
        artifactHashes: content.artifactHashes,
      }),
    ).toEqual({
      ...content,
      dataRange: {
        earliestAt: '2026-07-23T11:55:00.000Z',
        latestAt: '2026-07-23T12:00:00.000Z',
      },
      entityCounts: { revisions: 1, tasks: 2 },
      keyVersions: ['memo-v1', 'memo-v2'],
      recoveryWrapVersions: ['memo-v1', 'memo-v2'],
    });
  });

  it('rejects protected entity content and incomplete recovery metadata before signing', () => {
    const base = {
      version: 1 as const,
      region: 'us-west-2' as const,
      manifestId: content.manifestId,
      createdAt: content.createdAt,
      recoveryPointArn: content.recoveryPointArn,
      backupIds: content.backupIds,
      entities: [{ entityType: 'tasks', updatedAt: content.createdAt }],
      keyVersions: ['memo-v1'],
      recoveryWraps: [],
      artifactHashes: content.artifactHashes,
    };
    expect(() => buildManifestContentFromInventory(base)).toThrow();
    expect(() =>
      buildManifestContentFromInventory({
        ...base,
        entities: [{ ...base.entities[0]!, memo: 'protected content' }],
        recoveryWraps: [{ keyVersion: 'memo-v1', authority: 'recovery' as const }],
      }),
    ).toThrow();
  });

  it('hashes, signs, validates, and stores a complete inventory once', async () => {
    const { store, manifests } = memoryStore();
    const signer = vi.fn(async () => Buffer.from('signature').toString('base64'));
    const manifest = await createAndStoreManifest(content, 'alias/backup-signing', {
      signer,
      store,
    });
    expect(manifest.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(manifest.signature).toBe('c2lnbmF0dXJl');
    expect(manifests).toEqual([manifest]);
    expect(signer).toHaveBeenCalledWith(
      expect.objectContaining({ manifestId: content.manifestId, hash: manifest.hash }),
      'alias/backup-signing',
    );
  });

  it('fails integrity verification before consulting KMS when inventory changes', async () => {
    const { store } = memoryStore();
    const manifest = await createAndStoreManifest(content, 'key', {
      signer: async () => 'signature',
      store,
    });
    const verifier = vi.fn(async () => true);
    expect(
      await verifyStoredManifest(
        { ...manifest, entityCounts: { ...manifest.entityCounts, tasks: 11 } },
        'key',
        verifier,
      ),
    ).toBe(false);
    expect(verifier).not.toHaveBeenCalled();
  });

  it('stores validated restore evidence without protected entity content', async () => {
    const { store, evidence } = memoryStore();
    const value: RestoreEvidence = {
      startedAt: '2026-07-23T12:04:00.000Z',
      completedAt: '2026-07-23T13:00:00.000Z',
      rpoSeconds: 240,
      rtoSeconds: 3_360,
      authorizationPassed: true,
      decryptPassed: true,
      discrepancies: [],
    };
    await expect(recordRestoreEvidence(content.manifestId, value, store)).resolves.toEqual(value);
    expect(evidence).toEqual([value]);
  });
});
