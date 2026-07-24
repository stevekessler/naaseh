import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { attachmentBlobSchema, blobReferenceSchema, transitionAttachment } from '@naaseh/domain';
import {
  findAttachment,
  findUploadSession,
  saveAttachment,
  saveAttachmentBlob,
  saveBlobReference,
} from './attachment-repository.js';
import { authorizeAttachmentParent, type AttachmentActor } from './attachment-authorization.js';
import { publishAttachmentChange } from './attachment-audience.js';
const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';
export async function completeUpload(
  attachmentId: string,
  sessionId: string,
  objectVersionId: string,
  actor: AttachmentActor,
) {
  const attachment = await findAttachment(attachmentId);
  const session = await findUploadSession<any>(sessionId);
  if (
    !attachment ||
    !session ||
    session.attachmentId !== attachmentId ||
    session.actorId !== actor.id
  )
    throw Object.assign(new Error('Attachment not found.'), { statusCode: 404 });
  if (!(await authorizeAttachmentParent(attachment.parentType, attachment.parentId, actor, 'edit')))
    throw Object.assign(new Error('Attachment not found.'), { statusCode: 404 });
  const head = await s3.send(
    new HeadObjectCommand({
      Bucket: bucket,
      Key: `attachments/${attachment.blobId}`,
      VersionId: objectVersionId,
      ChecksumMode: 'ENABLED',
    }),
  );
  if (
    head.ContentLength !== attachment.sizeBytes ||
    head.ContentType !== attachment.mediaType ||
    head.ChecksumSHA256 !== attachment.checksumSha256 ||
    head.ServerSideEncryption !== 'aws:kms'
  )
    throw new Error('Uploaded object does not match the declared file.');
  const next = transitionAttachment(attachment, 'scanning');
  const timestamp = new Date().toISOString();
  await saveAttachmentBlob(
    attachmentBlobSchema.parse({
      blobId: attachment.blobId,
      attachmentId: attachment.id,
      objectKey: `attachments/${attachment.blobId}`,
      objectVersionId,
      sizeBytes: attachment.sizeBytes,
      checksumSha256: attachment.checksumSha256,
      encryptionKeyArn: head.SSEKMSKeyId ?? process.env.NAASEH_ATTACHMENT_KMS_KEY_ARN ?? 'unknown',
      scanStatus: 'pending',
      lifecycle: 'scanning',
      createdAt: attachment.createdAt,
      updatedAt: timestamp,
    }),
  );
  await saveBlobReference(
    blobReferenceSchema.parse({
      blobId: attachment.blobId,
      attachmentId: attachment.id,
      createdAt: timestamp,
    }),
  );
  await saveAttachment(next, attachment.version);
  await publishAttachmentChange(next);
  return next;
}
