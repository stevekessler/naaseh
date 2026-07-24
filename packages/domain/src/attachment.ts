import { z } from 'zod';
import { ulidSchema } from './primitives.js';
export const attachmentStatusSchema = z.enum([
  'pending_upload',
  'scanning',
  'available',
  'scan_failed',
  'rejected',
  'expired',
  'cancelled',
  'deleted',
]);
export const attachmentSchema = z
  .object({
    id: ulidSchema,
    parentType: z.enum(['task', 'listItem']),
    parentId: ulidSchema,
    blobId: ulidSchema,
    originalFilename: z.string().trim().min(1).max(255),
    mediaType: z.string().min(1).max(255),
    sizeBytes: z
      .number()
      .int()
      .min(1)
      .max(25 * 1024 * 1024),
    checksumSha256: z.string().regex(/^(?:[a-f0-9]{64}|[A-Za-z0-9+/]{43}=)$/i),
    uploaderId: z.string().min(1),
    status: attachmentStatusSchema,
    failureCode: z
      .enum(['malware', 'scan_error', 'policy', 'missing_object', 'checksum_mismatch'])
      .optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict();
export type Attachment = z.infer<typeof attachmentSchema>;
const allowed: Record<Attachment['status'], Attachment['status'][]> = {
  pending_upload: ['scanning', 'expired', 'cancelled', 'deleted'],
  scanning: ['available', 'scan_failed', 'rejected', 'deleted'],
  available: ['deleted'],
  scan_failed: ['scanning', 'deleted'],
  rejected: ['deleted'],
  expired: ['deleted'],
  cancelled: ['deleted'],
  deleted: [],
};
export function transitionAttachment(
  value: Attachment,
  status: Attachment['status'],
  now = new Date(),
): Attachment {
  if (!allowed[value.status].includes(status))
    throw new Error(`Invalid attachment transition: ${value.status} to ${status}`);
  return attachmentSchema.parse({
    ...value,
    status,
    updatedAt: now.toISOString(),
    version: value.version + 1,
    ...(['scan_failed', 'rejected'].includes(status) ? {} : { failureCode: undefined }),
  });
}
export const attachmentBlobSchema = z
  .object({
    blobId: ulidSchema,
    attachmentId: ulidSchema,
    objectKey: z.string().min(1),
    objectVersionId: z.string().min(1).optional(),
    sizeBytes: z.number().int().positive(),
    checksumSha256: z.string().min(32),
    encryptionKeyArn: z.string().min(1),
    scanStatus: z.enum(['pending', 'clean', 'threat', 'failed']),
    lifecycle: z.enum(['uploading', 'scanning', 'clean', 'quarantined', 'deleting', 'deleted']),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export type AttachmentBlob = z.infer<typeof attachmentBlobSchema>;
export const blobReferenceSchema = z
  .object({ blobId: ulidSchema, attachmentId: ulidSchema, createdAt: z.string().datetime() })
  .strict();
export type BlobReference = z.infer<typeof blobReferenceSchema>;
export const uploadSessionSchema = z
  .object({
    id: ulidSchema,
    attachmentId: ulidSchema,
    blobId: ulidSchema,
    actorId: z.string().min(1),
    parentType: z.enum(['task', 'listItem']),
    parentId: ulidSchema,
    expectedSizeBytes: z.number().int().positive(),
    expectedMediaType: z.string().min(1),
    expectedChecksumSha256: z.string().min(32),
    expiresAt: z.string().datetime(),
    status: z.enum(['initiated', 'uploaded', 'completed', 'expired', 'cancelled']),
  })
  .strict();
export type AttachmentUploadSession = z.infer<typeof uploadSessionSchema>;
