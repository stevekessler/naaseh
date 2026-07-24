import { DeleteObjectCommand, HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ScheduledHandler } from 'aws-lambda';
import { attachmentBlobSchema, transitionAttachment } from '@naaseh/domain';
import { log, metric } from '@naaseh/observability';
import {
  listAllAttachmentBlobs,
  listAllAttachments,
  listBlobReferences,
  saveAttachment,
  saveAttachmentBlob,
} from './attachment-repository.js';
import { publishAttachmentChange } from './attachment-audience.js';

const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';
const uploadTimeoutMs = 15 * 60 * 1000;
const scanTimeoutMs = 60 * 60 * 1000;

export const handler: ScheduledHandler = async (event) => {
  const now = new Date();
  let expiredUploads = 0;
  let stalledScans = 0;
  let missingObjects = 0;
  let orphanBlobs = 0;

  const attachments = await listAllAttachments();
  const attachmentsById = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  for (const attachment of attachments) {
    const age = now.getTime() - new Date(attachment.updatedAt).getTime();
    if (attachment.status === 'pending_upload' && age >= uploadTimeoutMs) {
      const expired = transitionAttachment(attachment, 'expired', now);
      await saveAttachment(expired, attachment.version);
      await publishAttachmentChange(expired);
      expiredUploads += 1;
    } else if (attachment.status === 'scanning' && age >= scanTimeoutMs) {
      const failed = {
        ...transitionAttachment(attachment, 'scan_failed', now),
        failureCode: 'scan_error' as const,
      };
      await saveAttachment(failed, attachment.version);
      await publishAttachmentChange(failed);
      stalledScans += 1;
    }
  }

  for (const blob of await listAllAttachmentBlobs()) {
    if (blob.lifecycle === 'deleted') continue;
    let exists = true;
    try {
      await s3.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: blob.objectKey,
          ...(blob.objectVersionId ? { VersionId: blob.objectVersionId } : {}),
        }),
      );
    } catch {
      exists = false;
    }
    if (!exists) {
      const attachment = attachmentsById.get(blob.attachmentId);
      if (attachment?.status === 'scanning') {
        const failed = {
          ...transitionAttachment(attachment, 'scan_failed', now),
          failureCode: 'missing_object' as const,
        };
        await saveAttachment(failed, attachment.version);
        await publishAttachmentChange(failed);
      }
      await saveAttachmentBlob(
        attachmentBlobSchema.parse({
          ...blob,
          scanStatus: 'failed',
          lifecycle: 'quarantined',
          updatedAt: now.toISOString(),
        }),
      );
      missingObjects += 1;
      continue;
    }
    const references = await listBlobReferences(blob.blobId);
    if (references.length === 0 && blob.objectVersionId) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: blob.objectKey,
          VersionId: blob.objectVersionId,
        }),
      );
      await saveAttachmentBlob(
        attachmentBlobSchema.parse({ ...blob, lifecycle: 'deleted', updatedAt: now.toISOString() }),
      );
      orphanBlobs += 1;
    }
  }

  log('attachment.reconciliation', {
    requestId: event.id,
    outcome: 'success',
    expiredUploads,
    stalledScans,
    missingObjects,
    orphanBlobs,
  });
  metric('AttachmentReconciliations', 1);
  metric('AttachmentExpiredUploads', expiredUploads);
  metric('AttachmentStalledScans', stalledScans);
  metric('AttachmentMissingObjects', missingObjects);
  metric('AttachmentOrphanBlobs', orphanBlobs);
};
