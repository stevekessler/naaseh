import { describe, expect, it } from 'vitest';
import {
  attachmentCompleteSchema,
  attachmentInitiateSchema,
  attachmentResponseSchema,
  attachmentUploadGrantSchema,
} from '@naaseh/contracts';
import { attachmentSchema } from '@naaseh/domain';
const attachment = attachmentSchema.parse({
  id: '01J00000000000000000000000',
  parentType: 'task',
  parentId: '01J00000000000000000000001',
  blobId: '01J00000000000000000000002',
  originalFilename: 'receipt.pdf',
  mediaType: 'application/pdf',
  sizeBytes: 100,
  checksumSha256: 'a'.repeat(64),
  uploaderId: 'owner',
  status: 'pending_upload',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  version: 1,
});
describe('attachment contracts', () => {
  it('validates initiation, completion, metadata, and a five-minute no-store grant shape', () => {
    expect(
      attachmentInitiateSchema.parse({
        parentType: 'task',
        parentId: attachment.parentId,
        originalFilename: 'receipt.pdf',
        mediaType: 'application/pdf',
        sizeBytes: 100,
        checksumSha256: 'a'.repeat(64),
      }),
    ).toMatchObject({ sizeBytes: 100 });
    expect(attachmentCompleteSchema.parse({ objectVersionId: 'version-1', etag: 'etag' })).toEqual({
      objectVersionId: 'version-1',
      etag: 'etag',
    });
    expect(attachmentResponseSchema.parse(attachment).id).toBe(attachment.id);
    expect(
      attachmentUploadGrantSchema.parse({
        attachment,
        uploadSessionId: '01J00000000000000000000003',
        uploadUrl: 'https://upload.invalid/object',
        requiredHeaders: { 'x-amz-checksum-sha256': 'hash' },
        expiresAt: '2026-01-01T00:05:00.000Z',
      }).expiresAt,
    ).toContain('00:05');
  });
  it('rejects oversized files and unknown response fields', () => {
    expect(() =>
      attachmentInitiateSchema.parse({
        parentType: 'task',
        parentId: attachment.parentId,
        originalFilename: 'x',
        mediaType: 'text/plain',
        sizeBytes: 25 * 1024 * 1024 + 1,
        checksumSha256: 'a'.repeat(64),
      }),
    ).toThrow();
    expect(() =>
      attachmentResponseSchema.parse({ ...attachment, downloadUrl: 'secret' }),
    ).toThrow();
  });
});
