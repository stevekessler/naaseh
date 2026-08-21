import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { attachmentSchema, createUlid, uploadSessionSchema } from '@naaseh/domain';
import { authorizeAttachmentParent, type AttachmentActor } from './attachment-authorization.js';
import {
  listParentAttachments,
  saveAttachment,
  saveUploadSession,
} from './attachment-repository.js';
import { validateFilePolicy } from './file-policy.js';
import { publishAttachmentChange } from './attachment-audience.js';
import { getRecord, putRecord } from '../shared/store.js';
import { keys } from '../shared/keys.js';
import { metric } from '@naaseh/observability';
const s3 = new S3Client({});
const bucket = process.env.NAASEH_ATTACHMENT_BUCKET ?? '';
const keyArn = process.env.NAASEH_ATTACHMENT_KMS_KEY_ARN ?? '';
export async function initiateUpload(
  input: {
    parentType: 'task' | 'listItem';
    parentId: string;
    originalFilename: string;
    mediaType: string;
    sizeBytes: number;
    checksumSha256: string;
  },
  actor: AttachmentActor,
  mutationId?: string,
  now = new Date(),
) {
  if (mutationId) {
    const requestKey = keys.uploadRequest(actor.id, mutationId);
    const replay = await getRecord<{ data: unknown; expiresAt: number }>(
      requestKey.PK,
      requestKey.SK,
    );
    if (replay?.data && replay.expiresAt > Math.floor(now.getTime() / 1000)) return replay.data;
  }
  if (!(await authorizeAttachmentParent(input.parentType, input.parentId, actor, 'edit')))
    throw Object.assign(new Error('Parent not found.'), { statusCode: 404 });
  const existing = await listParentAttachments(input.parentType, input.parentId);
  const policy = validateFilePolicy({
    filename: input.originalFilename,
    mediaType: input.mediaType,
    sizeBytes: input.sizeBytes,
    existingCount: existing.filter((item) => item.status !== 'deleted').length,
  });
  const attachmentId = createUlid(),
    blobId = createUlid(),
    sessionId = createUlid(),
    timestamp = now.toISOString(),
    expiresAt = new Date(now.getTime() + 300_000).toISOString();
  const attachment = attachmentSchema.parse({
    id: attachmentId,
    parentType: input.parentType,
    parentId: input.parentId,
    blobId,
    originalFilename: policy.filename,
    mediaType: policy.mediaType,
    sizeBytes: input.sizeBytes,
    checksumSha256: input.checksumSha256,
    uploaderId: actor.id,
    status: 'pending_upload',
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
  const session = uploadSessionSchema.parse({
    id: sessionId,
    attachmentId,
    blobId,
    actorId: actor.id,
    parentType: input.parentType,
    parentId: input.parentId,
    expectedSizeBytes: input.sizeBytes,
    expectedMediaType: policy.mediaType,
    expectedChecksumSha256: input.checksumSha256,
    expiresAt,
    status: 'initiated',
  });
  await saveAttachment(attachment, 0);
  await publishAttachmentChange(attachment);
  await saveUploadSession(session);
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: `attachments/${blobId}`,
    ContentType: policy.mediaType,
    ContentLength: input.sizeBytes,
    ChecksumSHA256: input.checksumSha256,
    ServerSideEncryption: 'aws:kms',
    SSEKMSKeyId: keyArn,
    Metadata: { attachmentid: attachmentId, sessionid: sessionId },
  });
  const grant = {
    attachment,
    uploadSessionId: sessionId,
    uploadUrl: await getSignedUrl(s3, command, { expiresIn: 300 }),
    requiredHeaders: {
      'content-type': policy.mediaType,
      'x-amz-checksum-sha256': input.checksumSha256,
      'x-amz-server-side-encryption': 'aws:kms',
      'x-amz-server-side-encryption-aws-kms-key-id': keyArn,
    },
    expiresAt,
  };
  if (mutationId) {
    const requestKey = keys.uploadRequest(actor.id, mutationId);
    try {
      await putRecord(
        {
          ...requestKey,
          data: grant,
          expiresAt: Math.floor(new Date(expiresAt).getTime() / 1000),
        },
        'attribute_not_exists(PK)',
      );
    } catch {
      const replay = await getRecord<{ data?: typeof grant }>(requestKey.PK, requestKey.SK);
      if (replay?.data) return replay.data;
      throw new Error('The upload request could not be recorded safely.');
    }
  }
  metric('AttachmentBytes', input.sizeBytes, 'Bytes');
  metric('AttachmentUploads', 1);
  return grant;
}
