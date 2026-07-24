import { attachmentBlobSchema, transitionAttachment } from '@naaseh/domain';
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { authorizeAttachmentParent, type AttachmentActor } from './attachment-authorization.js';
import {
  findAttachment,
  findAttachmentBlob,
  listBlobReferences,
  releaseBlobReference,
  saveAttachment,
  saveAttachmentBlob,
} from './attachment-repository.js';
import { publishAttachmentChange } from './attachment-audience.js';
export async function deleteAttachment(id: string, actor: AttachmentActor) {
  const current = await findAttachment(id);
  if (
    !current ||
    !(await authorizeAttachmentParent(current.parentType, current.parentId, actor, 'edit'))
  )
    throw Object.assign(new Error('Attachment not found.'), { statusCode: 404 });
  if (current.status === 'deleted') return current;
  const next = transitionAttachment(current, 'deleted');
  await saveAttachment(next, current.version);
  await publishAttachmentChange(next);
  await releaseBlobReference(current.blobId, current.id);
  const references = await listBlobReferences(current.blobId);
  if (references.length === 0) {
    const blob = await findAttachmentBlob(current.blobId);
    if (blob?.objectVersionId) {
      await saveAttachmentBlob(
        attachmentBlobSchema.parse({
          ...blob,
          lifecycle: 'deleting',
          updatedAt: new Date().toISOString(),
        }),
      );
      try {
        await new S3Client({}).send(
          new DeleteObjectCommand({
            Bucket: process.env.NAASEH_ATTACHMENT_BUCKET ?? '',
            Key: blob.objectKey,
            VersionId: blob.objectVersionId,
          }),
        );
        await saveAttachmentBlob(
          attachmentBlobSchema.parse({
            ...blob,
            lifecycle: 'deleted',
            updatedAt: new Date().toISOString(),
          }),
        );
      } catch {
        throw Object.assign(new Error('Attachment deletion is pending reconciliation.'), {
          statusCode: 503,
        });
      }
    }
  }
  return next;
}
