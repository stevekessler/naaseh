import type { APIGatewayRequestSimpleAuthorizerHandlerV2 } from 'aws-lambda';
import { createHash } from 'node:crypto';
import { findSession, refreshIdleExpiry } from './session-repository.js';
import { userById } from './user-repository.js';
import { listUserMemberships } from '../groups/group-repository.js';
export const handler: APIGatewayRequestSimpleAuthorizerHandlerV2 = async (event) => {
  const cookie = (event.headers?.cookie ?? '')
    .split(';')
    .map((v: string) => v.trim())
    .find((v: string) => v.startsWith('__Host-naaseh='));
  if (!cookie) return { isAuthorized: false };
  const token = cookie.slice('__Host-naaseh='.length);
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const now = new Date();
  const record = await findSession(tokenHash);
  if (
    !record ||
    record.revokedAt ||
    new Date(record.idleExpiresAt) <= now ||
    new Date(record.absoluteExpiresAt) <= now
  )
    return { isAuthorized: false };
  const user = await userById(record.userId);
  if (!user?.active || user.sessionEpoch !== record.sessionEpoch) return { isAuthorized: false };
  if (new Date(record.idleExpiresAt).getTime() - now.getTime() < 15 * 60_000) {
    const refreshed = new Date(
      Math.min(now.getTime() + 30 * 60_000, new Date(record.absoluteExpiresAt).getTime()),
    ).toISOString();
    await refreshIdleExpiry(tokenHash, refreshed);
  }
  const groupIds = (await listUserMemberships(record.userId))
    .filter((item) => item.status === 'active')
    .map((item) => item.groupId);
  return {
    isAuthorized: true,
    context: {
      userId: record.userId,
      role: user.role,
      csrfToken: record.csrfToken,
      sessionEpoch: record.sessionEpoch,
      groupIds: groupIds.join(','),
    },
  };
};
