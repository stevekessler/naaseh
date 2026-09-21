import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredUser } from '../../src/auth/user-repository.js';

const repository = vi.hoisted(() => ({
  saveTrustedDevice: vi.fn(),
  findTrustedDevice: vi.fn(),
  deleteTrustedDevice: vi.fn(),
  indexLegacyTrustedDevice: vi.fn(),
  touchTrustedDevice: vi.fn(),
  listTrustedDevicesForUser: vi.fn(),
  revokeTrustedDeviceForUser: vi.fn(),
  renameTrustedDeviceForUser: vi.fn(),
}));
vi.mock('../../src/auth/trusted-device-repository.js', () => repository);

import {
  TRUSTED_DEVICE_LIFETIME_SECONDS,
  browserLabel,
  forgetTrustedDevice,
  isTrustedDevice,
  issueTrustedDevice,
  isCurrentRememberedBrowser,
  listRememberedBrowsers,
  renameRememberedBrowser,
  revokeRememberedBrowser,
} from '../../src/auth/trusted-device.js';

const user = {
  id: 'user-1',
  tfaStatus: 'enabled',
  sessionEpoch: 4,
  credentialVersion: 2,
  tfaEnrolledAt: '2026-09-01T00:00:00.000Z',
} as StoredUser;
const now = new Date('2026-09-20T00:00:00.000Z');

beforeEach(() => vi.resetAllMocks());

describe('30-day trusted browser', () => {
  it('stores only a digest and issues a secure fixed-lifetime cookie', async () => {
    const cookie = await issueTrustedDevice(user, now);
    const token = cookie.match(/^__Host-naaseh-trusted-device=([^;]+)/)?.[1];
    expect(token).toBeTruthy();
    expect(cookie).toContain('Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000');
    expect(repository.saveTrustedDevice).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.objectContaining({
        userId: user.id,
        sessionEpoch: 4,
        credentialVersion: 2,
        expiresAt: '2026-10-20T00:00:00.000Z',
      }),
    );
    expect(JSON.stringify(repository.saveTrustedDevice.mock.calls)).not.toContain(token);
    expect(TRUSTED_DEVICE_LIFETIME_SECONDS).toBe(2_592_000);
  });

  it('accepts only the same active factor, account, epochs, and unexpired record', async () => {
    const record = {
      userId: user.id,
      sessionEpoch: 4,
      credentialVersion: 2,
      tfaEnrolledAt: user.tfaEnrolledAt,
      expiresAt: '2026-10-20T00:00:00.000Z',
    };
    repository.findTrustedDevice.mockResolvedValue(record);
    expect(await isTrustedDevice('opaque-token', user, now)).toBe(true);
    expect(await isTrustedDevice('opaque-token', { ...user, id: 'other-user' }, now)).toBe(false);
    expect(await isTrustedDevice('opaque-token', { ...user, sessionEpoch: 5 }, now)).toBe(false);
    expect(await isTrustedDevice('opaque-token', { ...user, credentialVersion: 3 }, now)).toBe(
      false,
    );
    expect(await isTrustedDevice('opaque-token', { ...user, tfaEnrolledAt: 'new' }, now)).toBe(
      false,
    );
    expect(await isTrustedDevice('opaque-token', { ...user, tfaStatus: 'disabled' }, now)).toBe(
      false,
    );
    expect(await isTrustedDevice('opaque-token', user, new Date(record.expiresAt))).toBe(false);
  });

  it('forgets a browser by deleting its server record and clearing its cookie', async () => {
    const cookie = await forgetTrustedDevice('opaque-token');
    expect(repository.deleteTrustedDevice).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
    expect(cookie).toContain('Max-Age=0');
  });

  it('labels browsers without relying on the user-agent for authorization', () => {
    expect(browserLabel('Mozilla/5.0 (iPad) CriOS/123.0 Safari/604.1')).toBe('Chrome on iPad');
    expect(browserLabel('Mozilla/5.0 (Macintosh) Chrome/123.0 Safari/537.36')).toBe(
      'Chrome on Mac',
    );
  });

  it('indexes an older trusted browser without extending its expiry', async () => {
    repository.findTrustedDevice.mockResolvedValue({
      userId: user.id,
      sessionEpoch: 4,
      credentialVersion: 2,
      tfaEnrolledAt: user.tfaEnrolledAt,
      expiresAt: '2026-10-20T00:00:00.000Z',
    });
    expect(await isTrustedDevice('opaque-token', user, now, 'Mozilla/5.0 (iPad) CriOS/123.0')).toBe(
      true,
    );
    expect(repository.indexLegacyTrustedDevice).toHaveBeenCalledWith(
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.objectContaining({
        userId: user.id,
        label: 'Chrome on iPad',
        expiresAt: '2026-10-20T00:00:00.000Z',
      }),
    );
  });

  it('fails closed if the user-scoped index is unavailable after remote revocation', async () => {
    repository.findTrustedDevice.mockResolvedValue({
      userId: user.id,
      sessionEpoch: 4,
      credentialVersion: 2,
      tfaEnrolledAt: user.tfaEnrolledAt,
      expiresAt: '2026-10-20T00:00:00.000Z',
      createdAt: now.toISOString(),
    });
    repository.touchTrustedDevice.mockRejectedValue(new Error('index missing'));
    await expect(isTrustedDevice('opaque-token', user, now)).rejects.toThrow('index missing');
  });

  it('lists only current valid browsers and marks this browser', async () => {
    const token = 'opaque-token';
    repository.findTrustedDevice.mockResolvedValue(undefined);
    repository.listTrustedDevicesForUser.mockResolvedValue([
      {
        id: 'other',
        record: {
          userId: 'other',
          sessionEpoch: 4,
          credentialVersion: 2,
          expiresAt: '2026-10-20T00:00:00.000Z',
        },
      },
      {
        id: 'a'.repeat(64),
        record: {
          userId: user.id,
          sessionEpoch: 4,
          credentialVersion: 2,
          tfaEnrolledAt: user.tfaEnrolledAt,
          expiresAt: '2026-09-19T00:00:00.000Z',
        },
      },
      {
        id: 'b'.repeat(64),
        record: {
          userId: user.id,
          sessionEpoch: 4,
          credentialVersion: 2,
          tfaEnrolledAt: user.tfaEnrolledAt,
          expiresAt: '2026-10-20T00:00:00.000Z',
          label: 'Chrome on Mac',
          createdAt: now.toISOString(),
          lastUsedAt: now.toISOString(),
        },
      },
    ]);
    const listed = await listRememberedBrowsers(user, token, now);
    expect(listed).toHaveLength(1);
    expect(listed[0]?.label).toBe('Chrome on Mac');
    expect(listed[0]?.current).toBe(false);
  });

  it('revokes or renames only a valid user-scoped browser ID', async () => {
    const id = 'a'.repeat(64);
    repository.revokeTrustedDeviceForUser.mockResolvedValue(true);
    repository.renameTrustedDeviceForUser.mockResolvedValue(true);
    expect(await revokeRememberedBrowser(user.id, 'invalid')).toBe(false);
    expect(await renameRememberedBrowser(user.id, 'invalid', 'My MacBook Pro')).toBe(false);
    expect(await revokeRememberedBrowser(user.id, id)).toBe(true);
    expect(await renameRememberedBrowser(user.id, id, 'My MacBook Pro')).toBe(true);
    expect(repository.revokeTrustedDeviceForUser).toHaveBeenCalledWith(user.id, id);
    expect(repository.renameTrustedDeviceForUser).toHaveBeenCalledWith(
      user.id,
      id,
      'My MacBook Pro',
    );
    expect(isCurrentRememberedBrowser('opaque-token', id)).toBe(false);
  });
});
