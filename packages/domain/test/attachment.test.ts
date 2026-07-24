import { describe, expect, it } from 'vitest';
import { attachmentSchema, transitionAttachment } from '../src/attachment.js';

const attachment = {
  id: '01J00000000000000000000000',
  parentType: 'listItem',
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
} as const;
describe('attachment lifecycle', () => {
  it('validates metadata and guarded transitions', () => {
    const parsed = attachmentSchema.parse(attachment);
    expect(transitionAttachment(parsed, 'scanning').status).toBe('scanning');
    expect(transitionAttachment(parsed, 'deleted').status).toBe('deleted');
    expect(() => transitionAttachment(parsed, 'available')).toThrow();
  });
  it('enforces the 25 MiB boundary', () => {
    expect(() =>
      attachmentSchema.parse({ ...attachment, sizeBytes: 25 * 1024 * 1024 + 1 }),
    ).toThrow();
  });
});
