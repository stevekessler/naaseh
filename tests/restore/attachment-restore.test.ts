import { describe, expect, it } from 'vitest';
import { validateEnhancedRecoveryRows } from '../../apps/api/src/crypto-recovery/backup-manifest.js';
const attachment = {
  id: '01J00000000000000000000000',
  blobId: '01J00000000000000000000001',
  status: 'available',
};
const blob = {
  blobId: attachment.blobId,
  objectKey: `attachments/${attachment.blobId}`,
  objectVersionId: 'v1',
  scanStatus: 'clean',
  lifecycle: 'clean',
};
describe('attachment restore invariants', () => {
  it('accepts an exact clean blob and reference inventory', () => {
    expect(
      validateEnhancedRecoveryRows([
        { PK: `ATTACHMENT#${attachment.id}`, SK: 'CURRENT', data: attachment },
        { PK: `BLOB#${blob.blobId}`, SK: 'CURRENT', data: blob },
        { PK: `BLOB#${blob.blobId}`, SK: `REF#${attachment.id}`, data: {} },
      ]),
    ).toMatchObject({ blobReferences: 1 });
  });
  it('rejects missing references, mismatched clean state, and missing exact versions', () => {
    expect(() =>
      validateEnhancedRecoveryRows([
        { PK: `ATTACHMENT#${attachment.id}`, SK: 'CURRENT', data: attachment },
        { PK: `BLOB#${blob.blobId}`, SK: 'CURRENT', data: blob },
      ]),
    ).toThrow('reference');
    expect(() =>
      validateEnhancedRecoveryRows([
        { PK: `BLOB#${blob.blobId}`, SK: 'CURRENT', data: { ...blob, objectVersionId: undefined } },
      ]),
    ).toThrow('version');
  });
});
