import { expect, it } from 'vitest';
import { attachmentBlobSchema, attachmentSchema } from '@naaseh/domain';
import { verifiedReceiptVersion } from '../../apps/api/src/attachments/receipt-content-service.js';
import { receiptRetention } from '../../apps/api/src/attachments/retention-service.js';

it('restores receipt bytes only when the exact version and both verdicts are retained', () => {
  const id = '01J00000000000000000000691';
  const blobId = '01J00000000000000000000692';
  const now = new Date('2026-11-14T00:00:00Z');
  const date = now.toISOString();
  const receipt = attachmentSchema.parse({
    id,
    blobId,
    parentType: 'financeTransaction',
    parentId: '01J00000000000000000000693',
    originalFilename: 'invoice.pdf',
    sizeBytes: 4,
    mediaType: 'application/pdf',
    checksumSha256: 'a'.repeat(64),
    uploaderId: 'owner',
    status: 'available',
    version: 3,
    createdAt: date,
    updatedAt: date,
  });
  const blob = attachmentBlobSchema.parse({
    blobId,
    attachmentId: id,
    objectKey: 'attachments/' + blobId,
    objectVersionId: 'exact',
    sizeBytes: 4,
    checksumSha256: receipt.checksumSha256,
    encryptionKeyArn: 'fixture-key',
    scanStatus: 'clean',
    lifecycle: 'clean',
    receiptChecks: {
      objectETag: '"content"',
      policyCleanVersion: 'exact',
      malwareCleanVersion: 'exact',
    },
    createdAt: date,
    updatedAt: date,
  });
  const restoredReceipt = attachmentSchema.parse(JSON.parse(JSON.stringify(receipt)));
  const restoredBlob = attachmentBlobSchema.parse(JSON.parse(JSON.stringify(blob)));
  expect(verifiedReceiptVersion(restoredReceipt, restoredBlob)?.versionId).toBe('exact');
  expect(
    verifiedReceiptVersion(restoredReceipt, { ...restoredBlob, objectVersionId: 'newer' }),
  ).toBeUndefined();
  expect(receiptRetention(restoredReceipt, { status: 'active' }, now)).toBeUndefined();
  const retained = receiptRetention(restoredReceipt, { status: 'tombstone' }, now)!;
  expect(retained).toEqual({ retentionReason: 'deleted', purgeAfter: '2026-12-14T00:00:00.000Z' });
  expect(receiptRetention(retained, undefined, new Date('2026-11-15'))).toEqual(retained);
  expect(receiptRetention(retained, { status: 'active' }, now)).toBeUndefined();
});
