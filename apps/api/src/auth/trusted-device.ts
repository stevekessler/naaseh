import { createHash, randomBytes } from 'node:crypto';
import type { StoredUser } from './user-repository.js';
import {
  deleteTrustedDevice,
  findTrustedDevice,
  saveTrustedDevice,
} from './trusted-device-repository.js';

export const TRUSTED_DEVICE_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
export const TRUSTED_DEVICE_COOKIE_NAME = '__Host-naaseh-trusted-device';

export const trustedDeviceCookie = (token: string, maxAge = TRUSTED_DEVICE_LIFETIME_SECONDS) =>
  `${TRUSTED_DEVICE_COOKIE_NAME}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export async function issueTrustedDevice(user: StoredUser, now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  await saveTrustedDevice(tokenHash(token), {
    userId: user.id,
    sessionEpoch: user.sessionEpoch,
    credentialVersion: user.credentialVersion,
    ...(user.tfaEnrolledAt ? { tfaEnrolledAt: user.tfaEnrolledAt } : {}),
    expiresAt: new Date(now.getTime() + TRUSTED_DEVICE_LIFETIME_SECONDS * 1_000).toISOString(),
  });
  return trustedDeviceCookie(token);
}

export async function isTrustedDevice(token: string, user: StoredUser, now = new Date()) {
  if (!token || user.tfaStatus !== 'enabled') return false;
  const record = await findTrustedDevice(tokenHash(token));
  return Boolean(
    record &&
      record.userId === user.id &&
      record.sessionEpoch === user.sessionEpoch &&
      record.credentialVersion === user.credentialVersion &&
      record.tfaEnrolledAt === user.tfaEnrolledAt &&
      new Date(record.expiresAt).getTime() > now.getTime(),
  );
}

export async function forgetTrustedDevice(token: string | undefined) {
  if (token) await deleteTrustedDevice(tokenHash(token));
  return trustedDeviceCookie('', 0);
}
