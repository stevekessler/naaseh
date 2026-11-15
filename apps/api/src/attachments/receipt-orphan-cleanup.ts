import { DeleteObjectCommand, ListObjectVersionsCommand, S3Client } from '@aws-sdk/client-s3';
import type { Attachment } from '@naaseh/domain';
import { FinanceUnitOfWork } from '../finance/unit-of-work.js';
import { keys } from '../shared/keys.js';

type Row = {
  PK: string;
  SK: string;
  data: Attachment;
  receiptCleanupUntil?: number;
  receiptCleanupAt?: string;
};
const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';
const waitMs = 15 * 60_000;
const leaseMs = 6 * 60_000;

export function createReceiptOrphanCleanup({
  work = () => new FinanceUnitOfWork(),
  listVersions = async (key: string) => {
    const response = await s3.send(
      new ListObjectVersionsCommand({
        Bucket: bucket,
        Prefix: key,
        MaxKeys: 10,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
    if (response.IsTruncated) throw new Error('Receipt object history exceeds the cleanup bound.');
    return (response.Versions ?? []).flatMap((item) =>
      item.Key === key && item.VersionId && item.VersionId !== 'null' ? [item.VersionId] : [],
    );
  },
  deleteVersion = async (key: string, versionId: string) => {
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
        VersionId: versionId,
      }),
      { abortSignal: AbortSignal.timeout(15_000) },
    );
  },
} = {}) {
  return async (id: string, now = new Date()) => {
    const uow = work();
    const row = await uow.get<Row>(keys.attachment(id));
    if (
      !row ||
      row.data.parentType !== 'financeTransaction' ||
      !['expired', 'cancelled'].includes(row.data.status) ||
      row.receiptCleanupAt ||
      (row.receiptCleanupUntil ?? 0) > now.getTime() ||
      now.getTime() - Date.parse(row.data.updatedAt) < waitMs ||
      (await uow.get(keys.attachmentBlob(row.data.blobId)))
    )
      return false;
    const lease = now.getTime() + leaseMs;
    const operation = { PK: 'FINANCE#RECEIPT_CLEANUP#' + id, SK: String(lease) };
    await uow.put({ ...row, receiptCleanupUntil: lease });
    await uow.commit({
      key: operation,
      fingerprint: JSON.stringify([row.data.blobId, row.data.version, lease]),
      result: true,
      expiresAt: Math.floor(lease / 1000) + 3600,
    });
    const key = 'attachments/' + row.data.blobId;
    for (const version of await listVersions(key)) await deleteVersion(key, version);

    const finish = work();
    const current = await finish.get<Row>(keys.attachment(id));
    if (
      !current ||
      current.data.version !== row.data.version ||
      current.receiptCleanupUntil !== lease
    )
      return false;
    await finish.put({ ...current, receiptCleanupUntil: 0, receiptCleanupAt: now.toISOString() });
    await finish.commit({
      key: { ...operation, SK: operation.SK + '#COMPLETE' },
      fingerprint: row.data.blobId,
      result: true,
      expiresAt: Math.floor(lease / 1000) + 3600,
    });
    return true;
  };
}
export const cleanupReceiptOrphan = createReceiptOrphanCleanup();
