import { Readable } from 'node:stream';
import { GetObjectCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import {
  MAX_FINANCE_RECEIPT_RANGE_BYTES,
  type Attachment,
  type AttachmentBlob,
} from '@naaseh/domain';
import { SafeApiError } from '../shared/http.js';

export function parseReceiptByteRange(value: string | undefined, sizeBytes: number) {
  const range = value && value.length <= 48 ? /^bytes=(\d+)-(\d+)$/u.exec(value) : undefined;
  const start = Number(range?.[1]);
  const end = Number(range?.[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end ||
    end >= sizeBytes ||
    end - start + 1 > MAX_FINANCE_RECEIPT_RANGE_BYTES
  )
    throw Object.assign(
      new SafeApiError(
        416,
        'receipt_range_invalid',
        'Request one valid receipt byte range.',
        'validation',
      ),
      {
        statusCode: 416,
        contentRange: 'bytes */' + sizeBytes,
      },
    );
  return { start, end };
}

export function verifiedReceiptVersion(receipt: Attachment, blob: AttachmentBlob | undefined) {
  if (
    receipt.parentType !== 'financeTransaction' ||
    receipt.status !== 'available' ||
    !blob?.objectVersionId ||
    blob.objectVersionId === 'null' ||
    blob.blobId !== receipt.blobId ||
    blob.attachmentId !== receipt.id ||
    blob.sizeBytes !== receipt.sizeBytes ||
    blob.checksumSha256 !== receipt.checksumSha256 ||
    blob.objectKey !== 'attachments/' + receipt.blobId ||
    blob.lifecycle !== 'clean' ||
    blob.scanStatus !== 'clean' ||
    blob.receiptChecks?.policyCleanVersion !== blob.objectVersionId ||
    blob.receiptChecks?.malwareCleanVersion !== blob.objectVersionId
  )
    return undefined;
  return {
    versionId: blob.objectVersionId,
    etag: blob.receiptChecks.objectETag,
    key: blob.objectKey,
  };
}

type ReceiptObjectRange = {
  key: string;
  versionId: string;
  etag: string;
  range: string;
  contentRange: string;
  length: number;
};

const missingReceipt = () =>
  new SafeApiError(404, 'receipt_not_found', 'Receipt not found.', 'not_found');
const changedReceipt = () =>
  new SafeApiError(
    412,
    'receipt_content_changed',
    'Refresh the receipt before downloading it.',
    'conflict',
  );
const unavailableBytes = () =>
  new SafeApiError(
    503,
    'receipt_content_unavailable',
    'Receipt content is temporarily unavailable.',
    'retryable_dependency',
    true,
  );

export function createReceiptContentReader(deps: {
  findReceipt: (id: string) => Promise<Attachment | undefined>;
  findBlob: (id: string) => Promise<AttachmentBlob | undefined>;
  authorize: (transactionId: string) => Promise<() => Promise<void>>;
  readBytes: (input: ReceiptObjectRange) => Promise<Uint8Array>;
}) {
  return async (
    id: string,
    headers: { range?: string | undefined; ifMatch?: string | undefined },
  ) => {
    const receipt = await deps.findReceipt(id);
    if (receipt?.parentType !== 'financeTransaction') throw missingReceipt();
    const assertCurrent = await deps.authorize(receipt.parentId);
    const version = verifiedReceiptVersion(receipt, await deps.findBlob(receipt.blobId));
    if (!version) throw missingReceipt();
    if (headers.ifMatch !== version.etag) throw changedReceipt();
    const { start, end } = parseReceiptByteRange(headers.range, receipt.sizeBytes);
    const length = end - start + 1;
    const contentRange = `bytes ${start}-${end}/${receipt.sizeBytes}`;
    const bytes = await deps.readBytes({
      ...version,
      range: `bytes=${start}-${end}`,
      contentRange,
      length,
    });
    if (bytes.byteLength !== length) throw unavailableBytes();
    const latest = await deps.findReceipt(id);
    if (!latest || latest.version !== receipt.version || latest.parentId !== receipt.parentId)
      throw missingReceipt();
    const latestVersion = verifiedReceiptVersion(latest, await deps.findBlob(latest.blobId));
    if (!latestVersion) throw missingReceipt();
    if (latestVersion.versionId !== version.versionId || latestVersion.etag !== version.etag)
      throw changedReceipt();
    await assertCurrent();
    return {
      statusCode: 206,
      isBase64Encoded: true,
      body: Buffer.from(bytes).toString('base64'),
      headers: {
        'content-type': receipt.mediaType,
        'content-range': contentRange,
        'content-length': String(length),
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; sandbox",
        'content-disposition': 'attachment',
        etag: version.etag,
      },
    };
  };
}

export function createReceiptS3Reader(s3: S3Client, bucket: string) {
  return async (request: ReceiptObjectRange) => {
    let object;
    try {
      object = await s3.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: request.key,
          VersionId: request.versionId,
          IfMatch: request.etag,
          Range: request.range,
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412)
        throw changedReceipt();
      throw unavailableBytes();
    }
    const body = object.Body;
    if (!(body instanceof Readable)) throw unavailableBytes();
    if (
      object.$metadata.httpStatusCode !== 206 ||
      object.VersionId !== request.versionId ||
      object.ETag !== request.etag ||
      object.ContentRange !== request.contentRange ||
      object.ContentLength !== request.length
    ) {
      body.destroy();
      throw unavailableBytes();
    }
    try {
      const bytes = Buffer.alloc(request.length);
      let offset = 0;
      for await (const chunk of body) {
        if (!Buffer.isBuffer(chunk) || offset + chunk.length > bytes.length)
          throw unavailableBytes();
        chunk.copy(bytes, offset);
        offset += chunk.length;
      }
      if (offset !== bytes.length) throw unavailableBytes();
      return bytes;
    } catch {
      throw unavailableBytes();
    } finally {
      body.destroy();
    }
  };
}
