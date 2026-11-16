import * as repository from '../../apps/api/src/attachments/attachment-repository.js';
import { handler as attachmentHandler } from '../../apps/api/src/attachments/handler.js';
import { describe, expect, it, vi } from 'vitest';
import type { Attachment, AttachmentBlob } from '@naaseh/domain';
import { createReceiptContentReader } from '../../apps/api/src/attachments/receipt-content-service.js';

function fixture() {
  const receipt = {
    id: 'receipt',
    blobId: 'blob',
    parentType: 'financeTransaction',
    parentId: 'transaction',
    status: 'available',
    sizeBytes: 4,
    checksumSha256: 'checksum',
    mediaType: 'application/pdf',
    version: 3,
  } as Attachment;
  const blob = {
    blobId: 'blob',
    attachmentId: receipt.id,
    objectKey: 'attachments/blob',
    objectVersionId: 'pinned',
    sizeBytes: 4,
    checksumSha256: 'checksum',
    scanStatus: 'clean',
    lifecycle: 'clean',
    receiptChecks: {
      policyCleanVersion: 'pinned',
      malwareCleanVersion: 'pinned',
      objectETag: '"etag"',
    },
  } as AttachmentBlob;
  const recheck = vi.fn(async () => {});
  const authorize = vi.fn(async () => recheck);
  const findReceipt = vi.fn(async () => receipt);
  const findBlob = vi.fn(async () => blob);
  const readBytes = vi.fn(async () => Uint8Array.of(1, 2));
  const read = createReceiptContentReader({ findReceipt, findBlob, authorize, readBytes });
  const headers = { range: 'bytes=0-1', ifMatch: '"etag"' };
  return { receipt, blob, authorize, recheck, readBytes, findBlob, read, headers };
}

describe('private Finance receipt ranges', () => {
  it('returns verified bytes with a fixed range and private response metadata', async () => {
    const f = fixture();
    expect(await f.read('receipt', f.headers)).toMatchObject({
      statusCode: 206,
      headers: {
        'content-range': 'bytes 0-1/4',
        'content-length': '2',
        'accept-ranges': 'bytes',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'content-type': 'application/pdf',
        etag: '"etag"',
      },
      body: 'AQI=',
      isBase64Encoded: true,
    });
    expect(f.readBytes).toHaveBeenCalledWith({
      key: 'attachments/blob',
      versionId: 'pinned',
      etag: '"etag"',
      range: 'bytes=0-1',
      contentRange: 'bytes 0-1/4',
      length: 2,
    });
    expect(f.recheck).toHaveBeenCalledOnce();
  });

  it('rejects a mismatched tag with 412 before reading object bytes', async () => {
    const f = fixture();
    await expect(f.read('receipt', { ...f.headers, ifMatch: '*' })).rejects.toMatchObject({
      status: 412,
    });
    expect(f.readBytes).not.toHaveBeenCalled();
  });

  it.each(['policyCleanVersion', 'malwareCleanVersion'] as const)(
    'requires %s for the same version',
    async (check) => {
      const f = fixture();
      f.blob.receiptChecks![check] = 'other-version';
      await expect(f.read('receipt', f.headers)).rejects.toMatchObject({ status: 404 });
      expect(f.readBytes).not.toHaveBeenCalled();
    },
  );

  it('rejects a second chunk after lock and discards a chunk if access changes during transfer', async () => {
    const f = fixture();
    await f.read('receipt', f.headers);
    f.authorize.mockRejectedValueOnce(new Error('Locked'));
    const second = { ...f.headers, range: 'bytes=2-3' };
    await expect(f.read('receipt', second)).rejects.toThrow('Locked');
    expect(f.readBytes).toHaveBeenCalledOnce();
    f.recheck.mockRejectedValueOnce(new Error('Source revoked'));
    await expect(f.read('receipt', second)).rejects.toThrow('Source revoked');
    expect(f.readBytes).toHaveBeenCalledTimes(2);
  });

  it('discards bytes when canonical storage changes during the read', async () => {
    const f = fixture();
    f.findBlob
      .mockResolvedValueOnce(f.blob)
      .mockResolvedValueOnce({ ...f.blob, lifecycle: 'quarantined' });
    await expect(f.read('receipt', f.headers)).rejects.toMatchObject({ status: 404 });
  });
});

it('denies the generic attachment metadata and signed download routes for receipt rows', async () => {
  const f = fixture();
  const receiptLookup = vi.spyOn(repository, 'findAttachment').mockResolvedValue(f.receipt);
  const blobLookup = vi.spyOn(repository, 'findAttachmentBlob').mockResolvedValue(f.blob);
  try {
    for (const suffix of ['', '/download']) {
      const response = await attachmentHandler(
        {
          rawPath: '/api/v1/attachments/receipt' + suffix,
          pathParameters: { attachmentId: 'receipt' },
          headers: {},
          requestContext: {
            requestId: 'fixture',
            http: { method: 'GET' },
            authorizer: { lambda: { userId: 'owner' } },
          },
        } as never,
        {} as never,
        () => {},
      );
      expect(response).toMatchObject({ statusCode: 404 });
      expect(JSON.stringify(response)).not.toMatch(/"url"|pinned|application\/pdf/u);
    }
  } finally {
    receiptLookup.mockRestore();
    blobLookup.mockRestore();
  }
});
