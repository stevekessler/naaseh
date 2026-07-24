import { createTask } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  MAX_RPO_SECONDS,
  MAX_RTO_SECONDS,
  validateRestore,
  type RestoreValidationContext,
} from '../../apps/api/src/crypto-recovery/restore-validator.js';
import { validateEnhancedRecoveryRows } from '../../apps/api/src/crypto-recovery/backup-manifest.js';

const tasks = [
  createTask({ label: 'sensitive-public-label', visibility: 'public' }, 'owner'),
  createTask({ label: 'sensitive-private-label', visibility: 'private' }, 'owner'),
];

const validContext: RestoreValidationContext = {
  recoveryPointAt: '2026-07-23T12:00:00.000Z',
  startedAt: '2026-07-23T12:04:00.000Z',
  completedAt: '2026-07-23T15:59:00.000Z',
  authorizationPassed: true,
  requiredKeyVersions: ['memo-v1', 'memo-v2', 'pepper-v3'],
  restoredKeyVersions: ['memo-v1', 'memo-v2', 'pepper-v3'],
  decryptedKeyVersions: ['memo-v1', 'memo-v2', 'pepper-v3'],
  expectedArtifactHashes: { manifest: 'a'.repeat(64), configuration: 'b'.repeat(64) },
  restoredArtifactHashes: { manifest: 'a'.repeat(64), configuration: 'b'.repeat(64) },
};

describe('full restore acceptance', () => {
  it('accepts exact entity counts, authorization, RPO/RTO, and every retained key generation', () => {
    expect(validateRestore({ tasks: 2, privateTasks: 1 }, tasks, validContext)).toMatchObject({
      passed: true,
      actual: { tasks: 2, privateTasks: 1 },
      rpoSeconds: 240,
      rtoSeconds: 14_100,
      missingKeyVersions: [],
      undecryptableKeyVersions: [],
      discrepancies: [],
    });
  });

  it('fails when RPO or RTO exceed the release targets', () => {
    const result = validateRestore({ tasks: 2, privateTasks: 1 }, tasks, {
      ...validContext,
      startedAt: new Date(
        Date.parse(validContext.recoveryPointAt) + MAX_RPO_SECONDS * 1_000 + 1,
      ).toISOString(),
      completedAt: new Date(
        Date.parse(validContext.recoveryPointAt) +
          MAX_RPO_SECONDS * 1_000 +
          MAX_RTO_SECONDS * 1_000 +
          2,
      ).toISOString(),
    });
    expect(result.passed).toBe(false);
    expect(result.discrepancies).toEqual([
      expect.stringContaining('RPO'),
      expect.stringContaining('RTO'),
    ]);
  });

  it('fails closed for authorization or any missing/undecryptable key generation', () => {
    const result = validateRestore({ tasks: 2, privateTasks: 1 }, tasks, {
      ...validContext,
      authorizationPassed: false,
      restoredKeyVersions: ['memo-v1', 'pepper-v3'],
      decryptedKeyVersions: ['memo-v1'],
    });
    expect(result.passed).toBe(false);
    expect(result.missingKeyVersions).toEqual(['memo-v2']);
    expect(result.undecryptableKeyVersions).toEqual(['memo-v2', 'pepper-v3']);
    expect(result.discrepancies).toEqual(
      expect.arrayContaining([
        expect.stringContaining('Authorization'),
        expect.stringContaining('Missing key versions'),
        expect.stringContaining('Undecryptable key versions'),
      ]),
    );
  });

  it('reports count mismatches without exposing restored task content', () => {
    const result = validateRestore({ tasks: 3, privateTasks: 2 }, tasks, validContext);
    expect(result.passed).toBe(false);
    expect(result.discrepancies.join(' ')).not.toContain('sensitive-public-label');
    expect(result.discrepancies.join(' ')).not.toContain('sensitive-private-label');
  });

  it('fails when any restored artifact hash differs from the signed manifest', () => {
    const result = validateRestore({ tasks: 2, privateTasks: 1 }, tasks, {
      ...validContext,
      restoredArtifactHashes: {
        ...validContext.restoredArtifactHashes,
        configuration: 'c'.repeat(64),
      },
    });
    expect(result.passed).toBe(false);
    expect(result.hashMismatches).toEqual(['configuration']);
    expect(result.discrepancies.join(' ')).not.toContain('sensitive');
  });

  it('probes restored list, directory, and exact S3 attachment relationships before exposure', () => {
    const rows = [
      { PK: 'LIST#list-1', SK: 'CURRENT', data: { id: 'list-1', ownerId: 'owner', locked: true } },
      {
        PK: 'LISTITEM#item-1',
        SK: 'CURRENT',
        data: { id: 'item-1', listId: 'list-1', directoryItemId: 'directory-1' },
      },
      { PK: 'DIRECTORY#directory-1', SK: 'CURRENT', data: { id: 'directory-1', version: 2 } },
      {
        PK: 'BLOB#blob-1',
        SK: 'CURRENT',
        data: {
          lifecycle: 'clean',
          scanStatus: 'clean',
          objectKey: 'attachments/blob-1',
          objectVersionId: 'version-7',
        },
      },
      { PK: 'BLOB#blob-1', SK: 'REF#attachment-1', data: {} },
      {
        PK: 'ATTACHMENT#attachment-1',
        SK: 'CURRENT',
        data: { id: 'attachment-1', blobId: 'blob-1', status: 'available' },
      },
    ];
    expect(validateEnhancedRecoveryRows(rows)).toEqual({ currentRecords: 5, blobReferences: 1 });
    expect(() =>
      validateEnhancedRecoveryRows(
        rows.map((row) =>
          row.PK === 'BLOB#blob-1' && row.SK === 'CURRENT'
            ? { ...row, data: { ...(row.data as object), objectVersionId: '' } }
            : row,
        ),
      ),
    ).toThrow(/exact S3 version/);
  });
});
