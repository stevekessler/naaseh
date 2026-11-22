import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { DynamoWorkspaceStore } from '../../apps/api/src/contacts-inventory/dynamo-store.js';
import {
  handleItemImage,
  imageRange,
  reconcileInventoryScan,
} from '../../apps/api/src/contacts-inventory/images.js';
import { describe, expect, it, vi } from 'vitest';
import {
  imageByteLimit,
  imageReadChunk,
  imageCandidateInputSchema,
} from '../../packages/contacts-inventory-contracts/src/images.js';
import {
  matchesImageSignature,
  scanState,
} from '../../apps/api/src/contacts-inventory/scan-results.js';

describe('inventory image candidate verification', () => {
  it('accepts only bounded single-image upload metadata', () => {
    const candidate = {
      id: 'b4d02419-80af-4a8f-b710-1a49e7ca3000',
      filename: 'synthetic.jpeg',
      mediaType: 'image/jpeg',
      bytes: imageByteLimit,
      imageGeneration: 0,
    };
    expect(imageCandidateInputSchema.safeParse(candidate).success).toBe(true);
    for (const changes of [
      { bytes: imageByteLimit + 1 },
      { filename: '../synthetic.jpeg' },
      { mediaType: 'image/svg+xml' },
    ])
      expect(imageCandidateInputSchema.safeParse({ ...candidate, ...changes }).success).toBe(false);
  });

  it('requires the declared file signature and a clean exact-version scan', () => {
    expect(matchesImageSignature('image/jpeg', Uint8Array.of(0xff, 0xd8, 0xff))).toBe(true);
    expect(matchesImageSignature('image/png', Uint8Array.of(0xff, 0xd8, 0xff))).toBe(false);
    expect(
      matchesImageSignature(
        'image/png',
        Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a),
      ),
    ).toBe(true);
    expect(scanState('THREATS_FOUND')).toBe('rejected');
    expect(scanState(undefined)).toBe('pending');
    expect(scanState('NO_THREATS_FOUND')).toBe('clean');
  });
});

it('serves only an active exact version and stops a stale or oversized range', async () => {
  const id = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
  const imageId = 'b4d02419-80af-4a8f-b710-1a49e7ca3001';
  const image = { id: imageId, mediaType: 'image/jpeg', bytes: 9 } as const;
  const item = { kind: 'item', id, image, imageGeneration: 2 } as const;
  const row = vi.fn().mockResolvedValue(item);
  const candidate = vi.fn().mockResolvedValue({ version: 'version-2' });
  const store = { record: row, imageCandidate: candidate } as unknown as DynamoWorkspaceStore;
  const send = vi.spyOn(S3Client.prototype, 'send').mockResolvedValue({
    Body: { transformToByteArray: async () => Uint8Array.of(0xff, 0xd8, 0xff) },
  } as never);
  const path = `items/${id}/image`;
  const request = (headers: Record<string, string>) =>
    ({
      headers,
      requestContext: { http: { method: 'GET' } },
    }) as APIGatewayProxyEventV2;

  try {
    await expect(
      handleItemImage(store, 'private', path, request({ range: 'bytes=3-5' })),
    ).resolves.toMatchObject({ statusCode: 416 });
    await expect(
      handleItemImage(
        store,
        'private',
        path,
        request({ range: 'bytes=3-5', 'if-match': '"stale"' }),
      ),
    ).resolves.toMatchObject({ statusCode: 412 });
    expect(send).not.toHaveBeenCalled();
    await expect(
      handleItemImage(store, 'private', path, request({ range: 'bytes=0-2' })),
    ).resolves.toMatchObject({
      statusCode: 206,
      isBase64Encoded: true,
      headers: { 'Cache-Control': 'no-store' },
    });
    const command = send.mock.calls[0]?.[0] as unknown as GetObjectCommand;
    expect(command.input).toMatchObject({
      Bucket: 'private',
      VersionId: 'version-2',
      Range: 'bytes=0-2',
    });
    row.mockResolvedValueOnce(item).mockResolvedValueOnce({ ...item, deleted: true });
    await expect(
      handleItemImage(store, 'private', path, request({ range: 'bytes=0-2' })),
    ).resolves.toMatchObject({ statusCode: 412 });
    expect(imageRange(`bytes=0-${imageReadChunk}`, imageReadChunk + 1)).toBeUndefined();
  } finally {
    send.mockRestore();
  }
});

it('activates only the clean exact version and keeps a superseded candidate inactive', async () => {
  const itemId = 'b4d02419-80af-4a8f-b710-1a49e7ca3000';
  const id = 'b4d02419-80af-4a8f-b710-1a49e7ca3001';
  const image = { id, mediaType: 'image/jpeg', bytes: 9 };
  const candidate = {
    ...image,
    version: 'current',
    createdAt: Date.now(),
    workspaceGeneration: 3,
    imageGeneration: 5,
  };
  const changeImage = vi.fn().mockResolvedValue(false);
  const record = vi.fn().mockResolvedValue({ deleted: true });
  const imageCandidate = vi.fn().mockResolvedValue(candidate);
  const store = { record, changeImage, imageCandidate } as unknown as DynamoWorkspaceStore;
  await reconcileInventoryScan(store, itemId, id, 'stale', 'NO_THREATS_FOUND');
  await reconcileInventoryScan(store, itemId, id, 'current', 'THREATS_FOUND');
  expect(changeImage).not.toHaveBeenCalled();
  imageCandidate.mockResolvedValueOnce({ ...candidate, createdAt: 0 });
  await reconcileInventoryScan(store, itemId, id, 'current', 'NO_THREATS_FOUND');
  expect(changeImage).not.toHaveBeenCalled();
  await reconcileInventoryScan(store, itemId, id, 'current', 'NO_THREATS_FOUND');
  expect(changeImage).toHaveBeenCalledExactlyOnceWith(itemId, 3, 5, image);
  expect(record).toHaveBeenCalledExactlyOnceWith({ kind: 'item', id: itemId });
});
