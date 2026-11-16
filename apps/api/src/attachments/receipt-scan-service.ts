import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import {
  attachmentBlobSchema,
  attachmentSchema,
  financeReceiptMediaTypes,
  transitionAttachment,
  type Attachment,
  type AttachmentBlob,
} from '@naaseh/domain';
import { log, metric } from '@naaseh/observability';
import { FinanceUnitOfWork } from '../finance/unit-of-work.js';
import { keys } from '../shared/keys.js';
import { checkReceiptPolicy } from './receipt-policy-checker.js';

type ReceiptMediaType = (typeof financeReceiptMediaTypes)[keyof typeof financeReceiptMediaTypes];
type BlobRow = { PK: string; SK: string; data: AttachmentBlob };
type ReceiptRow = { PK: string; SK: string; data: Attachment };
const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';

async function inspect(receipt: Attachment, blob: AttachmentBlob) {
  const type = Object.values(financeReceiptMediaTypes).find(
    (candidate) => candidate === receipt.mediaType,
  );
  if (!type || !blob.objectVersionId || !blob.receiptChecks) return false;
  const record = await s3.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: blob.objectKey,
      VersionId: blob.objectVersionId,
      IfMatch: blob.receiptChecks.objectETag,
      ChecksumMode: 'ENABLED',
    }),
  );
  const body = record.Body;
  if (!(body instanceof Readable)) throw new Error('Receipt inspection object is unavailable.');
  try {
    if (
      record.ContentLength !== receipt.sizeBytes ||
      record.VersionId !== blob.objectVersionId ||
      record.ETag !== blob.receiptChecks.objectETag ||
      record.ContentType !== type ||
      record.ChecksumSHA256 !== receipt.checksumSha256
    )
      return false;
    const bytes = Buffer.alloc(receipt.sizeBytes);
    let offset = 0;
    for await (const chunk of body) {
      if (!Buffer.isBuffer(chunk) || offset + chunk.length > bytes.length) return false;
      chunk.copy(bytes, offset);
      offset += chunk.length;
    }
    return offset === bytes.length && (await checkReceiptPolicy(bytes, type as ReceiptMediaType));
  } finally {
    body.destroy();
  }
}

/** Consume trusted scan evidence for the immutable object version pinned by completion. */
export function createReceiptScanService({
  work = () => new FinanceUnitOfWork(),
  inspectBytes = inspect,
  now = () => new Date(),
} = {}) {
  return async (id: string, versionId: string, verdict: string) => {
    const uow = work();
    const current = await uow.get<ReceiptRow>(keys.attachment(id));
    const receipt = current && attachmentSchema.safeParse(current.data).data;
    if (!current || receipt?.parentType !== 'financeTransaction' || receipt.status !== 'scanning')
      return undefined;
    const stored = await uow.get<BlobRow>(keys.attachmentBlob(receipt.blobId));
    const blob = stored && attachmentBlobSchema.safeParse(stored.data).data;
    if (
      !stored ||
      blob?.objectVersionId !== versionId ||
      blob.attachmentId !== id ||
      blob.blobId !== receipt.blobId ||
      blob.objectKey !== 'attachments/' + receipt.blobId ||
      blob.checksumSha256 !== receipt.checksumSha256 ||
      !blob.receiptChecks
    )
      return undefined;
    let status: 'available' | 'rejected' | 'scan_failed';
    let failureCode: Attachment['failureCode'];
    let policyClean = false;
    if (verdict === 'THREATS_FOUND') {
      status = 'rejected';
      failureCode = 'malware';
    } else if (verdict === 'NO_THREATS_FOUND') {
      try {
        policyClean = await inspectBytes(receipt, blob);
        status = policyClean ? 'available' : 'rejected';
        if (!policyClean) failureCode = 'policy';
      } catch {
        status = 'scan_failed';
        failureCode = 'scan_error';
      }
    } else {
      status = 'scan_failed';
      failureCode = 'scan_error';
    }
    const time = now();
    const next = {
      ...transitionAttachment(receipt, status, time),
      ...(failureCode ? { failureCode } : {}),
    };
    const updated = attachmentBlobSchema.parse({
      ...blob,
      receiptChecks: {
        objectETag: blob.receiptChecks.objectETag,
        ...(verdict === 'NO_THREATS_FOUND' ? { malwareCleanVersion: versionId } : {}),
        ...(policyClean ? { policyCleanVersion: versionId } : {}),
      },
      scanStatus:
        status === 'available' ? 'clean' : failureCode === 'malware' ? 'threat' : 'failed',
      lifecycle: status === 'available' ? 'clean' : 'quarantined',
      updatedAt: time.toISOString(),
    });
    await uow.put({ ...current, data: next, version: next.version });
    await uow.put({ ...stored, data: updated });
    const saved = await uow.commit({
      key: { PK: 'FINANCE#RECEIPT_SCAN#' + id, SK: String(receipt.version) },
      fingerprint: JSON.stringify([versionId, verdict]),
      result: next.status,
      expiresAt: Math.floor(time.getTime() / 1000) + 3600,
    });
    log('finance.receipt_check', { outcome: saved, status: saved });
    metric('AttachmentScanResults', 1, 'Count', { status: saved });
    if (saved !== 'available') metric('AttachmentScanFailures', 1, 'Count', { status: saved });
    if (saved === 'scan_failed' && verdict !== 'SCAN_TIMEOUT') metric('AttachmentScanFailures', 1);
    if (failureCode === 'malware') metric('AttachmentThreats', 1);
    metric('AttachmentScanLatency', time.getTime() - Date.parse(receipt.createdAt), 'Milliseconds');
    return saved;
  };
}
export const applyReceiptScanResult = createReceiptScanService();
