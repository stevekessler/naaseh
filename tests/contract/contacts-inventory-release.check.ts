import { isActiveRelease } from '../../apps/api/src/contacts-inventory/active-release.js';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import { switchRelease } from '../../tools/release-contacts-inventory.mjs';

const current = 'retained';
const candidate = 'candidate';

function manifest(releaseId: string) {
  const entry = `/features/contacts-inventory/releases/${releaseId}/entry.js`;
  return { releaseId, hostProtocol: 1, apiProtocol: 1, entry, assets: [entry] };
}

describe('Contacts and Inventory release pointer', () => {
  it('probes before publishing and switches only from the expected version', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ETag: '"active-version"',
        Body: { transformToString: async () => JSON.stringify(manifest(current)) },
      })
      .mockResolvedValueOnce({});
    const verify = vi.fn().mockResolvedValue(undefined);
    await switchRelease({
      objects: { send },
      bucket: 'feature',
      expectedRelease: current,
      manifest: manifest(candidate),
      verify,
    });
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GetObjectCommand);
    expect(verify).toHaveBeenCalledWith(manifest(candidate));
    expect(verify.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[1]!);
    const write = send.mock.calls[1]?.[0] as PutObjectCommand;
    expect(write.input).toMatchObject({
      IfMatch: '"active-version"',
      CacheControl: 'no-store',
      Body: JSON.stringify(manifest(candidate)),
    });
  });

  it('keeps a current release active if the probe fails or the expected version differs', async () => {
    const send = vi.fn().mockResolvedValue({
      ETag: '"active-version"',
      Body: { transformToString: async () => JSON.stringify(manifest(current)) },
    });
    const verify = vi.fn().mockRejectedValue(new Error('probe failed'));
    const request = { objects: { send }, bucket: 'feature', manifest: manifest(candidate), verify };
    await expect(switchRelease({ ...request, expectedRelease: current })).rejects.toThrow(
      'probe failed',
    );
    await expect(switchRelease({ ...request, expectedRelease: candidate })).rejects.toThrow(
      'changed',
    );
    expect(verify).toHaveBeenCalledTimes(1);
    expect(send.mock.calls.every(([request]) => request instanceof GetObjectCommand)).toBe(true);
  });

  it('withdraws a first release without deleting the retained objects', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        ETag: '"first-version"',
        Body: { transformToString: async () => JSON.stringify(manifest(candidate)) },
      })
      .mockResolvedValueOnce({});
    await switchRelease({
      objects: { send },
      bucket: 'feature',
      expectedRelease: candidate,
      manifest: null,
    });
    const write = send.mock.calls[1]?.[0] as PutObjectCommand;
    expect(write.input).toMatchObject({ IfMatch: '"first-version"', Body: '{"inactive":true}' });
  });
});

it('rejects stale API versions as soon as the authoritative manifest switches or withdraws', async () => {
  const send = vi
    .spyOn(S3Client.prototype, 'send')
    .mockResolvedValueOnce({
      Body: { transformToString: async () => JSON.stringify(manifest(candidate)) },
    } as never)
    .mockResolvedValueOnce({
      Body: { transformToString: async () => JSON.stringify(manifest(candidate)) },
    } as never)
    .mockResolvedValueOnce({
      Body: { transformToString: async () => '{"inactive":true}' },
    } as never);
  try {
    await expect(isActiveRelease('feature', candidate)).resolves.toBe(true);
    await expect(isActiveRelease('feature', current)).resolves.toBe(false);
    await expect(isActiveRelease('feature', candidate)).resolves.toBe(false);
    expect(send).toHaveBeenCalledTimes(3);
    expect((send.mock.calls[0]?.[0] as unknown as GetObjectCommand).input).toMatchObject({
      Bucket: 'feature',
      Key: 'features/contacts-inventory/release.json',
    });
  } finally {
    send.mockRestore();
  }
});
