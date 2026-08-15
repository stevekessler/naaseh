import { describe, expect, it } from 'vitest';
import { shouldCacheRequest } from '../../src/app/service-worker-update.js';
import {
  attachmentMediaType,
  checksumFile,
} from '../../src/features/attachments/attachment-client.js';
describe('browser attachment boundary', () => {
  it('never caches metadata routes or signed capabilities', () => {
    expect(shouldCacheRequest(new Request('https://app.test/api/v1/attachments/id'))).toBe(false);
    expect(
      shouldCacheRequest(new Request('https://bucket.test/object?X-Amz-Signature=secret')),
    ).toBe(false);
  });
  it('hashes selected bytes without placing them in a persistent cache', async () => {
    const bytes = new Blob(['receipt'], { type: 'text/plain' }) as File;
    Object.defineProperty(bytes, 'name', { value: 'receipt.txt' });
    expect(await checksumFile(bytes)).toMatch(/^[A-Za-z0-9+/]{43}=$/);
  });
  it('canonicalizes generic iOS document-provider MIME types from supported extensions', () => {
    expect(
      attachmentMediaType({ name: 'Amazon order.pdf', type: 'application/octet-stream' }),
    ).toBe('application/pdf');
    expect(attachmentMediaType({ name: 'PHOTO.JPEG', type: '' })).toBe('image/jpeg');
    expect(attachmentMediaType({ name: 'payload.bin', type: 'application/octet-stream' })).toBe(
      'application/octet-stream',
    );
  });
});
