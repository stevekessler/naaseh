import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { findAttachment, findAttachmentBlob } from './attachment-repository.js';
import { authorizeAttachmentParent, type AttachmentActor } from './attachment-authorization.js';
const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';
export async function createDownloadGrant(id: string, actor: AttachmentActor) {
  const attachment = await findAttachment(id);
  const blob = attachment ? await findAttachmentBlob(attachment.blobId) : undefined;
  if (
    !attachment ||
    attachment.status !== 'available' ||
    !blob ||
    blob.lifecycle !== 'clean' ||
    !blob.objectVersionId ||
    !(await authorizeAttachmentParent(attachment.parentType, attachment.parentId, actor, 'read'))
  )
    throw Object.assign(new Error('Attachment not found.'), { statusCode: 404 });
  return {
    url: await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: bucket,
        Key: `attachments/${attachment.blobId}`,
        VersionId: blob.objectVersionId,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(attachment.originalFilename)}`,
      }),
      { expiresIn: 60 },
    ),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
