import { CopyObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { attachmentBlobSchema, transitionAttachment } from '@naaseh/domain';
import { authorizeAttachmentParent, type AttachmentActor } from './attachment-authorization.js';
import {
  findAttachment,
  findAttachmentBlob,
  saveAttachment,
  saveAttachmentBlob,
} from './attachment-repository.js';
import { publishAttachmentChange } from './attachment-audience.js';

const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';

export async function retryAttachmentScan(id: string, actor: AttachmentActor) {
  const attachment = await findAttachment(id);
  if (
    !attachment ||
    attachment.status !== 'scan_failed' ||
    !(await authorizeAttachmentParent(attachment.parentType, attachment.parentId, actor, 'edit'))
  )
    throw Object.assign(new Error('Attachment not found.'), { statusCode: 404 });
  const blob = await findAttachmentBlob(attachment.blobId);
  if (!blob?.objectVersionId)
    throw Object.assign(new Error('Attachment cannot be rescanned.'), { statusCode: 409 });
  const copied = await s3.send(
    new CopyObjectCommand({
      Bucket: bucket,
      Key: blob.objectKey,
      CopySource: `${bucket}/${blob.objectKey}?versionId=${encodeURIComponent(blob.objectVersionId)}`,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.NAASEH_ATTACHMENT_KMS_KEY_ARN,
      MetadataDirective: 'COPY',
      TaggingDirective: 'REPLACE',
    }),
  );
  if (!copied.VersionId) throw new Error('Attachment rescan did not create a protected version.');
  const now = new Date();
  await saveAttachmentBlob(
    attachmentBlobSchema.parse({
      ...blob,
      objectVersionId: copied.VersionId,
      scanStatus: 'pending',
      lifecycle: 'scanning',
      updatedAt: now.toISOString(),
    }),
  );
  const next = transitionAttachment(attachment, 'scanning', now);
  await saveAttachment(next, attachment.version);
  await publishAttachmentChange(next);
  return next;
}
