import { createHash, randomBytes } from 'node:crypto';
import type { StoredUser } from './user-repository.js';
import {
  deleteTrustedDevice,
  findTrustedDevice,
  indexLegacyTrustedDevice,
  listTrustedDevicesForUser,
  renameTrustedDeviceForUser,
  revokeTrustedDeviceForUser,
  saveTrustedDevice,
  touchTrustedDevice,
} from './trusted-device-repository.js';

export const TRUSTED_DEVICE_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export const TRUSTED_DEVICE_COOKIE_NAME = '__Host-naaseh-trusted-device';

export const trustedDeviceCookie = (token: string, maxAge = TRUSTED_DEVICE_LIFETIME_SECONDS) =>
  `${TRUSTED_DEVICE_COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const validDeviceId = (id: string) => /^[0-9a-f]{64}$/.test(id);

export function browserLabel(userAgent: string | undefined) {
  const agent = userAgent ?? '';
  const browser = /CriOS\//.test(agent)
    ? 'Chrome'
    : /Edg(?:e|iOS|A)?\//.test(agent)
      ? 'Edge'
      : /FxiOS\/|Firefox\//.test(agent)
        ? 'Firefox'
        : /Chrome\//.test(agent)
          ? 'Chrome'
          : /Safari\//.test(agent)
            ? 'Safari'
            : 'Browser';
  const device = /iPad/.test(agent)
    ? 'iPad'
    : /iPhone/.test(agent)
      ? 'iPhone'
      : /Android/.test(agent)
        ? 'Android'
        : /Macintosh|Mac OS X/.test(agent)
          ? 'Mac'
          : /Windows/.test(agent)
            ? 'Windows'
            : 'device';
  return `${browser} on ${device}`;
}

export async function issueTrustedDevice(user: StoredUser, now = new Date(), userAgent?: string) {
  const token = randomBytes(32).toString('base64url');
  await saveTrustedDevice(tokenHash(token), {
    userId: user.id,
    sessionEpoch: user.sessionEpoch,
    credentialVersion: user.credentialVersion,
    ...(user.tfaEnrolledAt ? { tfaEnrolledAt: user.tfaEnrolledAt } : {}),
    expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_LIFETIME_SECONDS * 1_000).toISOString(),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    label: browserLabel(userAgent),
  });
  return trustedDeviceCookie(token);
}

export async function isTrustedDevice(
  token: string,
  user: StoredUser,
  now = new Date(),
  userAgent?: string,
) {
  if (!token || user.tfaStatus !== 'enabled') return false;
  const hash = tokenHash(token);
  const record = await findTrustedDevice(hash);
  const valid = Boolean(
    record &&
      record.userId === user.id &&
      record.sessionEpoch === user.sessionEpoch &&
      record.credentialVersion === user.credentialVersion &&
      record.tfaEnrolledAt === user.tfaEnrolledAt &&
      new Date(record.expiresAt).getTime() > now.getTime(),
  );
  if (valid && record) {
    if (!record.createdAt) {
      await indexLegacyTrustedDevice(hash, {
        ...record,
        createdAt: new Date(
          new Date(record.expiresAt).getTime() - TRUSTED_DEVICE_LIFETIME_SECONDS * 1_000,
        ).toISOString(),
        lastUsedAt: now.toISOString(),
        label: browserLabel(userAgent),
      });
    }
    // Fail closed if the user-scoped index disappeared during remote revocation.
    await touchTrustedDevice(user.id, hash, now.toISOString());
  }
  return valid;
}

export async function forgetTrustedDevice(token: string | undefined) {
  if (token) await deleteTrustedDevice(tokenHash(token));
  return trustedDeviceCookie('', 0);
}

export async function listRememberedBrowsers(
  user: StoredUser,
  currentToken: string | undefined,
  now = new Date(),
  userAgent?: string,
) {
  if (currentToken) await isTrustedDevice(currentToken, user, now, userAgent);
  const records = await listTrustedDevicesForUser(user.id);
  const currentId = currentToken ? tokenHash(currentToken) : undefined;
  return records
    .filter(
      ({ record }) =>
        user.tfaStatus === 'enabled' &&
        record.userId === user.id &&
        record.sessionEpoch === user.sessionEpoch &&
        record.credentialVersion === user.credentialVersion &&
        record.tfaEnrolledAt === user.tfaEnrolledAt &&
        new Date(record.expiresAt).getTime() > now.getTime(),
    )
    .map(({ id, record }) => ({
      id,
      label: record.label ?? 'Remembered browser',
      createdAt: record.createdAt ?? record.expiresAt,
      lastUsedAt: record.lastUsedAt ?? record.createdAt ?? record.expiresAt,
      expiresAt: record.expiresAt,
      current: id === currentId,
    }))
    .sort((left, right) => right.lastUsedAt.localeCompare(left.lastUsedAt));
}

export async function revokeRememberedBrowser(userId: string, id: string) {
  if (!validDeviceId(id)) return false;
  return revokeTrustedDeviceForUser(userId, id);
}

export async function renameRememberedBrowser(userId: string, id: string, label: string) {
  if (!validDeviceId(id)) return false;
  return renameTrustedDeviceForUser(userId, id, label);
}

export function isCurrentRememberedBrowser(token: string | undefined, id: string) {
  return Boolean(token && validDeviceId(id) && tokenHash(token) === id);
}
