import { describe, expect, it } from 'vitest';
import { attachmentSchema, transitionAttachment, uploadSessionSchema } from '@naaseh/domain';
import { validateFilePolicy } from '../../apps/api/src/attachments/file-policy.js';
const base = attachmentSchema.parse({
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
describe('attachment lifecycle integration', () => {
  it('binds an upload session to exact parent, checksum, type, size, and expiry', () => {
    const session = uploadSessionSchema.parse({
      id: '01J00000000000000000000003',
      attachmentId: base.id,
      blobId: base.blobId,
      actorId: 'owner',
      parentType: base.parentType,
      parentId: base.parentId,
      expectedSizeBytes: base.sizeBytes,
      expectedMediaType: base.mediaType,
      expectedChecksumSha256: base.checksumSha256,
      expiresAt: '2026-01-01T00:05:00.000Z',
      status: 'initiated',
    });
    expect(session.expectedChecksumSha256).toBe(base.checksumSha256);
    expect(
      validateFilePolicy({
        filename: '../receipt.pdf',
        mediaType: base.mediaType,
        sizeBytes: base.sizeBytes,
      }).filename,
    ).not.toContain('/');
  });
  it('canonicalizes generic document-provider types for supported filenames', () => {
    expect(
      validateFilePolicy({
        filename: 'Amazon order.PDF',
        mediaType: 'application/octet-stream',
        sizeBytes: base.sizeBytes,
      }).mediaType,
    ).toBe('application/pdf');
    expect(() =>
      validateFilePolicy({
        filename: 'unknown.bin',
        mediaType: 'application/octet-stream',
        sizeBytes: base.sizeBytes,
      }),
    ).toThrow('not supported');
  });
  it('is fail-closed across scan ordering and permits idempotent terminal observation', () => {
    const scanning = transitionAttachment(base, 'scanning');
    const clean = transitionAttachment(scanning, 'available');
    expect(clean.status).toBe('available');
    expect(() => transitionAttachment(clean, 'scan_failed')).toThrow();
    const deleted = transitionAttachment(clean, 'deleted');
    expect(deleted.status).toBe('deleted');
    expect(() => transitionAttachment(deleted, 'deleted')).toThrow();
  });
});
