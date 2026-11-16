import { createHash } from 'node:crypto';
import type { Context, ScheduledEvent } from 'aws-lambda';
import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { afterEach, expect, it, vi } from 'vitest';
import { attachmentBlobSchema, attachmentSchema } from '@naaseh/domain';
import * as attachments from '../../apps/api/src/attachments/attachment-repository.js';
import { handler } from '../../apps/api/src/attachments/reconciliation-handler.js';
import { verifiedReceiptVersion } from '../../apps/api/src/attachments/receipt-content-service.js';
import { receiptRetention } from '../../apps/api/src/attachments/retention-service.js';
import * as receiptSource from '../../apps/api/src/finance/receipt-transaction-source.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

afterEach(() => vi.restoreAllMocks());

it('restores the exact verified receipt version under its reconciled transaction', async () => {
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
  const canonicalId = '01J00000000000000000000694';
  const accountId = '01J00000000000000000000695';
  const PK = 'FINANCE#SCOPE#restored-fixture';
  const aliasKey = {
    PK,
    SK: 'ROW#transactionAliases#' + createHash('sha256').update(receipt.parentId).digest('hex'),
  };
  const snapshot = [
    { PK, SK: 'META', revision: 7 },
    {
      ...aliasKey,
      collection: 'transactionAliases',
      entryKey: receipt.parentId,
      data: canonicalId,
    },
    ...[
      { id: receipt.parentId, accountId, status: 'tombstone' },
      { id: canonicalId, accountId, status: 'active' },
    ].flatMap((transaction) => {
      const storageKey = { PK, SK: 'ROW#transactions#' + transaction.id };
      return [
        { ...storageKey, collection: 'transactions', entryKey: transaction.id, data: transaction },
        { ...financeLocatorKey('transactions', transaction.id), storageKey },
      ];
    }),
  ];
  const restored = financePersistenceFixture();
  for (const row of snapshot) {
    restored.rows.set(restored.key(row), JSON.parse(JSON.stringify(row)));
  }
  const resolveReceiptTransaction = receiptSource.resolveReceiptTransaction;
  const resolve = () =>
    resolveReceiptTransaction(
      restoredReceipt.parentId,
      new FinanceUnitOfWork(restored.persistence, 'table'),
    );
  const canonical = await resolve();
  expect(canonical).toMatchObject({
    id: canonicalId,
    accountId,
    status: 'active',
    transferred: true,
  });
  expect(verifiedReceiptVersion(restoredReceipt, restoredBlob)?.versionId).toBe('exact');
  expect(
    verifiedReceiptVersion(restoredReceipt, { ...restoredBlob, objectVersionId: 'newer' }),
  ).toBeUndefined();
  expect(
    verifiedReceiptVersion(restoredReceipt, {
      ...restoredBlob,
      receiptChecks: { objectETag: '"content"', malwareCleanVersion: 'exact' },
    }),
  ).toBeUndefined();
  expect(receiptRetention(restoredReceipt, canonical, now)).toBeUndefined();

  vi.spyOn(receiptSource, 'resolveReceiptTransaction').mockImplementation(resolve);
  const listAttachments = vi
    .spyOn(attachments, 'listAllAttachments')
    .mockResolvedValue([restoredReceipt]);
  vi.spyOn(attachments, 'listAllAttachmentBlobs').mockResolvedValue([restoredBlob]);
  vi.spyOn(attachments, 'listBlobReferences').mockResolvedValue([]);
  const findAttachment = vi.spyOn(attachments, 'findAttachment').mockResolvedValue(restoredReceipt);
  const saveBlob = vi.spyOn(attachments, 'saveAttachmentBlob').mockResolvedValue(restoredBlob);
  const s3 = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
  const reconcile = () =>
    handler({ id: 'receipt-restore' } as ScheduledEvent, {} as Context, vi.fn());
  await reconcile();
  expect(s3.mock.calls.map(([command]) => command)).toEqual([expect.any(HeadObjectCommand)]);
  expect(saveBlob).not.toHaveBeenCalled();

  const deletedReceipt = attachmentSchema.parse({ ...restoredReceipt, status: 'deleted' });
  listAttachments.mockResolvedValue([deletedReceipt]);
  findAttachment.mockResolvedValue(deletedReceipt);
  s3.mockClear();
  await reconcile();
  expect(s3.mock.calls.map(([command]) => command)).toEqual([
    expect.any(HeadObjectCommand),
    expect.any(DeleteObjectCommand),
  ]);
  expect(s3.mock.calls[1]?.[0]).toHaveProperty('input.VersionId', 'exact');

  restored.rows.delete(restored.key(aliasKey));
  const retained = receiptRetention(restoredReceipt, await resolve(), now)!;
  expect(retained).toEqual({ retentionReason: 'deleted', purgeAfter: '2026-12-14T00:00:00.000Z' });
  expect(receiptRetention(retained, undefined, new Date('2026-11-15'))).toEqual(retained);
  expect(receiptRetention(retained, canonical, now)).toBeUndefined();
});
