import { createHash } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  attachmentBlobSchema,
  attachmentSchema,
  createUlid,
  transitionAttachment,
  uploadSessionSchema,
  type Attachment,
  type AttachmentBlob,
  type AttachmentUploadSession,
} from '@naaseh/domain';
import {
  financeReceiptCompleteSchema,
  financeReceiptUploadSchema,
  financeReceiptRetrySchema,
} from '@naaseh/contracts';
import { z } from 'zod';
import { FinanceUnitOfWork } from './unit-of-work.js';
import { keys } from '../shared/keys.js';
import { SafeApiError } from '../shared/http.js';
import { validateReceiptFilePolicy } from '../attachments/file-policy.js';
import { verifiedReceiptVersion } from '../attachments/receipt-content-service.js';
import {
  attachmentUploadUnhoistableHeaders,
  requiredAttachmentUploadHeaders,
} from '../attachments/upload-service.js';

type Authorize = (
  id: string,
  action?: 'read' | 'edit',
) => Promise<(() => Promise<void>) & { transaction: Record<string, unknown> }>;
type ReceiptRecord = {
  PK: string;
  SK: string;
  data: Attachment;
  uploadSessionId: string;
  receiptIntent: string;
  receiptCleanupUntil?: number;
  receiptCleanupAt?: string;
};
type UploadGrant = {
  receipt: Attachment;
  uploadUrl?: string;
  uploadSessionId?: string;
  expiresAt?: string;
  requiredHeaders?: Record<string, string>;
};

function parseSession(row: Record<string, unknown> | undefined) {
  if (!row) throw missing();
  const { PK: _partitionKey, SK: _sortKey, ...data } = row;
  void _partitionKey;
  void _sortKey;
  return uploadSessionSchema.parse(data);
}

const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';
const kmsKey = process.env.NAASEH_ATTACHMENT_KMS_KEY_ARN ?? '';
const missing = () => new SafeApiError(404, 'receipt_not_found', 'Receipt not found.', 'not_found');
const conflict = () =>
  new SafeApiError(409, 'receipt_changed', 'Receipt changed. Refresh and try again.', 'conflict');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const timestamp = (now: Date) => Math.floor(now.getTime() / 1000) + 3600;
const recordKey = (id: string, operation: string, revision: string | number) => ({
  PK: 'FINANCE#RECEIPT_MUTATION#' + id,
  SK: operation + '#' + revision,
});
const blobPath = (blobId: string) => 'attachments/' + blobId;
const parse = (row: ReceiptRecord | undefined) => {
  const value = attachmentSchema.safeParse(row?.data);
  return value.success && value.data.parentType === 'financeTransaction' ? value.data : undefined;
};

export function createReceiptService({
  authorize,
  actorId,
  encryptionKey = kmsKey,
  work = () => new FinanceUnitOfWork(),
  now = () => new Date(),
  presign = async (session: AttachmentUploadSession) =>
    getSignedUrl(
      s3,
      new PutObjectCommand({
        Bucket: bucket,
        Key: blobPath(session.blobId),
        ContentType: session.expectedMediaType,
        ContentLength: session.expectedSizeBytes,
        ChecksumSHA256: session.expectedChecksumSha256,
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: encryptionKey,
        IfNoneMatch: '*',
        Metadata: { attachmentid: session.attachmentId, sessionid: session.id },
      }),
      {
        expiresIn: Math.max(
          1,
          Math.min(300, Math.floor((Date.parse(session.expiresAt) - Date.now()) / 1000)),
        ),
        signableHeaders: new Set(['content-type', 'if-none-match']),
        unhoistableHeaders: attachmentUploadUnhoistableHeaders,
      },
    ),
  head = async (key: string, versionId?: string) =>
    s3.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
        ...(versionId ? { VersionId: versionId } : {}),
        ChecksumMode: 'ENABLED',
      }),
    ),
}: {
  authorize: Authorize;
  actorId: string;
  encryptionKey?: string;
  work?: () => FinanceUnitOfWork;
  now?: () => Date;
  presign?: (session: AttachmentUploadSession) => Promise<string>;
  head?: (
    key: string,
    versionId?: string,
  ) => Promise<{
    VersionId?: string | undefined;
    ETag?: string | undefined;
    ContentLength?: number | undefined;
    ContentType?: string | undefined;
    ChecksumSHA256?: string | undefined;
    SSEKMSKeyId?: string | undefined;
    ServerSideEncryption?: string | undefined;
    Metadata?: Record<string, string> | undefined;
  }>;
}) {
  const authorized = async (id: string, action: 'read' | 'edit') => {
    const uow = work();
    const row = await uow.get<ReceiptRecord>(keys.attachment(id));
    const value = parse(row);
    if (!value || !row || value.status === 'deleted') throw missing();
    return { uow, row, value, assertCurrent: await authorize(value.parentId, action) };
  };
  const writeReceipt = (uow: FinanceUnitOfWork, row: ReceiptRecord, value: Attachment) =>
    uow.put({ ...row, data: value, version: value.version });

  return {
    async initiate(
      transactionId: string,
      rawInput: z.input<typeof financeReceiptUploadSchema>,
    ): Promise<UploadGrant> {
      const input = financeReceiptUploadSchema.parse(rawInput);
      const assertCurrent = await authorize(transactionId, 'edit');
      const accountId = assertCurrent.transaction.accountId;
      if (typeof accountId !== 'string') throw missing();
      const policy = validateReceiptFilePolicy(input);
      const checksumSha256 = /^[0-9a-f]{64}$/iu.test(input.checksumSha256)
        ? Buffer.from(input.checksumSha256, 'hex').toString('base64')
        : input.checksumSha256;
      if (Buffer.from(checksumSha256, 'base64').toString('base64') !== checksumSha256)
        throw new SafeApiError(
          400,
          'invalid_receipt_checksum',
          'Choose the receipt file again.',
          'validation',
        );
      const time = now();
      const id = input.clientReceiptId;
      const uow = work();
      const prior = await uow.get<ReceiptRecord>(keys.attachment(id));
      const intent = digest([actorId, transactionId, policy, checksumSha256]);
      let value: Attachment;
      let session: AttachmentUploadSession;
      if (prior) {
        const priorReceipt = parse(prior);
        if (
          !priorReceipt ||
          priorReceipt.uploaderId !== actorId ||
          priorReceipt.parentId !== transactionId
        )
          throw missing();
        if (prior.receiptIntent !== intent) throw conflict();
        if ((prior.receiptCleanupUntil ?? 0) > time.getTime())
          throw new SafeApiError(
            409,
            'receipt_cleanup_pending',
            'Try uploading the saved receipt again shortly.',
            'conflict',
          );
        value = priorReceipt;
        if (!['pending_upload', 'expired'].includes(value.status)) {
          await assertCurrent();
          return { receipt: value };
        }
        session = parseSession(await uow.get(keys.uploadSession(prior.uploadSessionId)));
        if (value.status === 'expired' || Date.parse(session.expiresAt) <= time.getTime()) {
          if (session.status !== 'initiated') throw conflict();
          const renewed = {
            ...session,
            expiresAt: new Date(time.getTime() + 300_000).toISOString(),
          };
          value = {
            ...value,
            status: 'pending_upload',
            updatedAt: time.toISOString(),
            version: value.version + 1,
          };
          await writeReceipt(
            uow,
            { ...prior, receiptCleanupUntil: 0, receiptCleanupAt: '' },
            value,
          );
          await uow.put({ ...keys.uploadSession(session.id), ...renewed });
          await assertCurrent();
          const saved = await uow
            .commit({
              key: recordKey(id, 'renew', value.version),
              fingerprint: intent,
              result: renewed,
              expiresAt: timestamp(time),
            })
            .catch(() => {
              throw conflict();
            });
          session = uploadSessionSchema.parse(saved);
        }
      } else {
        value = attachmentSchema.parse({
          id,
          parentType: 'financeTransaction',
          parentId: transactionId,
          blobId: createUlid(),
          originalFilename: policy.filename,
          mediaType: policy.mediaType,
          sizeBytes: policy.sizeBytes,
          checksumSha256,
          uploaderId: actorId,
          status: 'pending_upload',
          createdAt: time.toISOString(),
          updatedAt: time.toISOString(),
          version: 1,
        });
        session = uploadSessionSchema.parse({
          id: createUlid(),
          attachmentId: id,
          blobId: value.blobId,
          parentType: value.parentType,
          parentId: transactionId,
          actorId,
          expectedSizeBytes: value.sizeBytes,
          expectedMediaType: value.mediaType,
          expectedChecksumSha256: checksumSha256,
          expiresAt: new Date(time.getTime() + 300_000).toISOString(),
          status: 'initiated',
        });
        await uow.put({
          ...keys.attachment(id),
          data: value,
          version: value.version,
          receiptIntent: intent,
          uploadSessionId: session.id,
          GSI1PK: 'ATTACHMENT#PARENT#financeTransaction#' + transactionId,
          GSI1SK: value.createdAt + '#' + id,
          GSI2PK: 'FINANCE#RECEIPTS#' + accountId,
          GSI2SK: value.createdAt + '#' + id,
        });
        await uow.put({ ...keys.uploadSession(session.id), ...session });
        await assertCurrent();
        const saved = await uow
          .commit({
            key: recordKey(id, 'initiate', 1),
            fingerprint: intent,
            result: session.id,
            expiresAt: timestamp(time),
          })
          .catch(() => {
            throw conflict();
          });
        if (saved !== session.id) {
          return await this.initiate(transactionId, input);
        }
      }
      if (
        session.actorId !== actorId ||
        session.attachmentId !== id ||
        session.blobId !== value.blobId ||
        session.parentType !== 'financeTransaction' ||
        session.parentId !== transactionId ||
        session.status !== 'initiated'
      )
        throw conflict();
      const uploadUrl = await presign(session);
      await assertCurrent();
      return {
        receipt: value,
        uploadUrl,
        uploadSessionId: session.id,
        expiresAt: session.expiresAt,
        requiredHeaders: {
          ...requiredAttachmentUploadHeaders({
            mediaType: value.mediaType,
            checksumSha256,
            keyArn: encryptionKey,
            attachmentId: id,
            sessionId: session.id,
          }),
          'if-none-match': '*',
        },
      };
    },

    async complete(id: string, rawInput: z.input<typeof financeReceiptCompleteSchema>) {
      const input = financeReceiptCompleteSchema.parse(rawInput);
      const expected = 'objectVersionId' in input ? input : undefined;
      const { uow, row, value, assertCurrent } = await authorized(id, 'edit');
      if (value.uploaderId !== actorId || row.uploadSessionId !== input.uploadSessionId)
        throw missing();
      if (value.status === 'expired')
        throw new SafeApiError(
          409,
          'receipt_upload_expired',
          'Retry the encrypted receipt upload.',
          'conflict',
        );
      const existing = await uow.get<{ PK: string; SK: string; data: AttachmentBlob }>(
        keys.attachmentBlob(value.blobId),
      );
      if (value.status !== 'pending_upload') {
        if (
          !existing ||
          !existing.data.objectVersionId ||
          !existing.data.receiptChecks ||
          (expected &&
            (existing.data.objectVersionId !== expected.objectVersionId ||
              existing.data.receiptChecks.objectETag !== expected.etag))
        )
          throw conflict();
        await assertCurrent();
        return value;
      }
      const session = parseSession(await uow.get(keys.uploadSession(input.uploadSessionId)));
      const time = now();
      if (
        session.actorId !== actorId ||
        session.attachmentId !== id ||
        session.blobId !== value.blobId ||
        session.parentType !== 'financeTransaction' ||
        session.parentId !== value.parentId
      )
        throw missing();
      if (
        Date.parse(session.expiresAt) + 900_000 <= time.getTime() ||
        session.status !== 'initiated'
      )
        throw conflict();
      const object = await head(blobPath(value.blobId), expected?.objectVersionId);
      const versionId = object.VersionId;
      const etag = object.ETag;
      if (
        !versionId ||
        versionId === 'null' ||
        versionId === 'unknown' ||
        !etag ||
        (expected && (versionId !== expected.objectVersionId || etag !== expected.etag)) ||
        object.ContentLength !== value.sizeBytes ||
        object.ContentType !== value.mediaType ||
        object.ChecksumSHA256 !== value.checksumSha256 ||
        object.ServerSideEncryption !== 'aws:kms' ||
        object.SSEKMSKeyId !== encryptionKey ||
        object.Metadata?.attachmentid !== id ||
        object.Metadata?.sessionid !== session.id
      )
        throw new SafeApiError(
          409,
          'receipt_object_mismatch',
          'The upload does not match this receipt. Select the file again.',
          'conflict',
        );
      const blob = attachmentBlobSchema.parse({
        blobId: value.blobId,
        attachmentId: id,
        objectKey: blobPath(value.blobId),
        objectVersionId: versionId,
        receiptChecks: { objectETag: etag },
        sizeBytes: value.sizeBytes,
        checksumSha256: value.checksumSha256,
        encryptionKeyArn: encryptionKey,
        scanStatus: 'pending',
        lifecycle: 'scanning',
        createdAt: value.createdAt,
        updatedAt: time.toISOString(),
      });
      const next = transitionAttachment(value, 'scanning', time);
      await uow.put({ ...keys.attachmentBlob(blob.blobId), data: blob });
      await uow.put({
        ...keys.blobReference(blob.blobId, id),
        data: { blobId: blob.blobId, attachmentId: id, createdAt: time.toISOString() },
      });
      await uow.put({ ...keys.uploadSession(session.id), ...session, status: 'completed' });
      await writeReceipt(uow, row, next);
      await assertCurrent();
      return uow
        .commit({
          key: recordKey(id, 'complete', 1),
          fingerprint: digest([input.uploadSessionId, versionId, etag]),
          result: next,
          expiresAt: timestamp(time),
        })
        .catch(() => {
          throw conflict();
        });
    },

    async metadata(id: string) {
      const { uow, value, assertCurrent } = await authorized(id, 'read');
      if (
        ['pending_upload', 'cancelled', 'expired'].includes(value.status) &&
        value.uploaderId !== actorId
      )
        throw missing();
      const blob = await uow.get<{ PK: string; SK: string; data: AttachmentBlob }>(
        keys.attachmentBlob(value.blobId),
      );
      const content = verifiedReceiptVersion(value, blob?.data);
      await assertCurrent();
      return {
        ...value,
        ...(typeof assertCurrent.transaction.id === 'string'
          ? { parentId: assertCurrent.transaction.id }
          : {}),
        ...(content ? { etag: content.etag } : {}),
      };
    },

    async retry(id: string, rawInput: z.input<typeof financeReceiptRetrySchema>) {
      const input = financeReceiptRetrySchema.parse(rawInput);
      const { uow, row, value, assertCurrent } = await authorized(id, 'edit');
      if (
        value.version !== input.expectedVersion ||
        !['scan_failed', 'scanning'].includes(value.status)
      )
        throw conflict();
      if (value.status === 'scanning') return value;
      const blob = await uow.get<{ PK: string; SK: string; data: AttachmentBlob }>(
        keys.attachmentBlob(value.blobId),
      );
      if (!blob?.data.objectVersionId || !blob.data.receiptChecks) throw conflict();
      const time = now();
      const next = transitionAttachment(value, 'scanning', time);
      await writeReceipt(uow, row, next);
      await uow.put({
        ...blob,
        data: {
          ...blob.data,
          lifecycle: 'scanning',
          scanStatus: 'pending',
          updatedAt: time.toISOString(),
        },
      });
      await assertCurrent();
      return uow
        .commit({
          key: recordKey(id, 'retry', input.expectedVersion),
          fingerprint: digest(input),
          result: next,
          expiresAt: timestamp(time),
        })
        .catch(() => {
          throw conflict();
        });
    },

    async cancel(id: string) {
      const { uow, row, value, assertCurrent } = await authorized(id, 'edit');
      if (value.uploaderId !== actorId) throw missing();
      if (value.status === 'cancelled') return value;
      if (!['pending_upload', 'scanning', 'scan_failed'].includes(value.status)) throw conflict();
      const time = now();
      const next = attachmentSchema.parse({
        ...value,
        status: 'cancelled',
        updatedAt: time.toISOString(),
        version: value.version + 1,
      });
      await writeReceipt(uow, row, next);
      if (await uow.get(keys.blobReference(value.blobId, id)))
        await uow.delete(keys.blobReference(value.blobId, id));
      await assertCurrent();
      return uow
        .commit({
          key: recordKey(id, 'cancel', value.version),
          fingerprint: digest([actorId, id]),
          result: next,
          expiresAt: timestamp(time),
        })
        .catch(() => {
          throw conflict();
        });
    },
  };
}
