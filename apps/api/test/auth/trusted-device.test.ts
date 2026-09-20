import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoredUser } from '../../src/auth/user-repository.js';

const repository = vi.hoisted(() => ({
  saveTrustedDevice: vi.fn(),
  findTrustedDevice: vi.fn(),
  deleteTrustedDevice: vi.fn(),
}));
vi.mock('../../src/auth/trusted-device-repository.js', () => repository);

import {
  TRUSTED_DEVICE_LIFETIME_SECONDS,
  forgetTrustedDevice,
  isTrustedDevice,
  issueTrustedDevice,
} from '../../src/auth/trusted-device.js';

const user = {
  id: 'user-1',
  tfaStatus: 'enabled',
  sessionEpoch: 4,
  credentialVersion: 2,
  tfaEnrolledAt: '2026-09-01T00:00:00.000Z',
} as StoredUser;
const now = new Date('2026-09-20T00:00:00.000Z');

beforeEach(() => vi.clearAllMocks());

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
});
