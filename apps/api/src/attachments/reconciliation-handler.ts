import {
  DeleteObjectCommand,
  GetObjectTaggingCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ScheduledHandler } from 'aws-lambda';
import { attachmentBlobSchema, attachmentSchema, transitionAttachment } from '@naaseh/domain';
import { log, metric } from '@naaseh/observability';
import {
  listAllAttachmentBlobs,
  listAllAttachments,
  listBlobReferences,
  releaseBlobReference,
  saveAttachment,
  saveAttachmentBlob,
} from './attachment-repository.js';
import { publishAttachmentChange } from './attachment-audience.js';
import { taskAttachmentRetention } from './retention-service.js';
import { findTask } from '../tasks/task-repository.js';

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
  let retentionScheduled = 0;
  let retentionCleared = 0;
  let purgedAttachments = 0;
  let recoveredScans = 0;

  const attachments = await listAllAttachments();
  const blobs = await listAllAttachmentBlobs();
  const blobsByAttachmentId = new Map(blobs.map((blob) => [blob.attachmentId, blob]));
  const tasks = new Map<string, Awaited<ReturnType<typeof findTask>>>();
  const attachmentsById = new Map();
  for (const storedAttachment of attachments) {
    let attachment = storedAttachment;
    if (attachment.status !== 'deleted' && attachment.parentType === 'task') {
      if (!tasks.has(attachment.parentId))
        tasks.set(attachment.parentId, await findTask(attachment.parentId));
      const desired =
        attachment.retentionReason === 'deleted'
          ? { purgeAfter: attachment.purgeAfter, retentionReason: attachment.retentionReason }
          : taskAttachmentRetention(tasks.get(attachment.parentId));
      const changed =
        desired?.purgeAfter !== attachment.purgeAfter ||
        desired?.retentionReason !== attachment.retentionReason;
      if (changed) {
        attachment = attachmentSchema.parse({
          ...attachment,
          purgeAfter: desired?.purgeAfter,
          retentionReason: desired?.retentionReason,
          updatedAt: now.toISOString(),
          version: attachment.version + 1,
        });
        await saveAttachment(attachment, storedAttachment.version);
        await publishAttachmentChange(attachment);
        if (desired) retentionScheduled += 1;
        else retentionCleared += 1;
      }
    }
    if (
      attachment.status !== 'deleted' &&
      attachment.purgeAfter &&
      Date.parse(attachment.purgeAfter) <= now.getTime()
    ) {
      const deleted = transitionAttachment(attachment, 'deleted', now);
      await saveAttachment(deleted, attachment.version);
      await publishAttachmentChange(deleted);
      await releaseBlobReference(attachment.blobId, attachment.id);
      attachment = deleted;
      purgedAttachments += 1;
    }
    attachmentsById.set(attachment.id, attachment);
    const age = now.getTime() - new Date(attachment.updatedAt).getTime();
    if (attachment.status === 'pending_upload' && age >= uploadTimeoutMs) {
      const expired = transitionAttachment(attachment, 'expired', now);
      await saveAttachment(expired, attachment.version);
      await publishAttachmentChange(expired);
      attachmentsById.set(expired.id, expired);
      expiredUploads += 1;
    } else if (attachment.status === 'scanning') {
      const blob = blobsByAttachmentId.get(attachment.id);
      let taggedResult: string | undefined;
      if (blob?.objectVersionId) {
        try {
          const tags = await s3.send(
            new GetObjectTaggingCommand({
              Bucket: bucket,
              Key: blob.objectKey,
              VersionId: blob.objectVersionId,
            }),
          );
          taggedResult = tags.TagSet?.find(
            (tag) => tag.Key === 'GuardDutyMalwareScanStatus',
          )?.Value;
        } catch {
          // A transient tag lookup must not turn a healthy upload into a failed scan.
        }
      }
      if (blob && taggedResult) {
        const status =
          taggedResult === 'NO_THREATS_FOUND'
            ? 'available'
            : taggedResult === 'THREATS_FOUND'
              ? 'rejected'
              : 'scan_failed';
        const recovered = {
          ...transitionAttachment(attachment, status, now),
          ...(status === 'rejected'
            ? { failureCode: 'malware' as const }
            : status === 'scan_failed'
              ? { failureCode: 'scan_error' as const }
              : {}),
        };
        await saveAttachmentBlob(
          attachmentBlobSchema.parse({
            ...blob,
            scanStatus:
              status === 'available' ? 'clean' : status === 'rejected' ? 'threat' : 'failed',
            lifecycle: status === 'available' ? 'clean' : 'quarantined',
            updatedAt: now.toISOString(),
          }),
        );
        await saveAttachment(recovered, attachment.version);
        await publishAttachmentChange(recovered);
        attachment = recovered;
        attachmentsById.set(recovered.id, recovered);
        recoveredScans += 1;
      } else if (age >= scanTimeoutMs) {
        const failed = {
          ...transitionAttachment(attachment, 'scan_failed', now),
          failureCode: 'scan_error' as const,
        };
        await saveAttachment(failed, attachment.version);
        await publishAttachmentChange(failed);
        attachment = failed;
        attachmentsById.set(failed.id, failed);
        stalledScans += 1;
      }
    }
  }

  for (const blob of blobs) {
    if (blob.lifecycle === 'deleted') continue;
    let exists = true;
    // The bucket deliberately denies GetObject/HeadObject until the clean tag is present, and it
    // permanently denies reads for quarantined versions. A denied head is therefore not evidence
    // that either kind of object is missing.
    if (blob.lifecycle !== 'scanning' && blob.lifecycle !== 'quarantined') {
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
    retentionScheduled,
    retentionCleared,
    purgedAttachments,
    recoveredScans,
  });
  metric('AttachmentReconciliations', 1);
  metric('AttachmentExpiredUploads', expiredUploads);
  metric('AttachmentStalledScans', stalledScans);
  metric('AttachmentMissingObjects', missingObjects);
  metric('AttachmentOrphanBlobs', orphanBlobs);
  metric('AttachmentRetentionScheduled', retentionScheduled);
  metric('AttachmentRetentionCleared', retentionCleared);
  metric('AttachmentRetentionPurged', purgedAttachments);
  metric('AttachmentRecoveredScans', recoveredScans);
};
