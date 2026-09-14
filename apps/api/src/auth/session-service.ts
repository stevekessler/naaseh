import { createHash, randomUUID } from 'node:crypto';
import { sessionActive, type SessionRecord } from '@naaseh/domain';
import { newSession, sessionCookie } from './session.js';
import { deleteSession, findSession, saveSession } from './session-repository.js';
export const sessionTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function issueSession(userId: string, sessionEpoch: number, now = new Date()) {
  const generated = newSession(now);
  const record: SessionRecord = {
    id: randomUUID(),
    userId,
    csrfToken: generated.csrfToken,
    sessionEpoch,
    createdAt: now.toISOString(),
    // Inactive windows remain signed in until the fixed 30-day deadline.
    idleExpiresAt: generated.expiresAt,
    absoluteExpiresAt: generated.expiresAt,
  };
  await saveSession(generated.tokenHash, record);
  return { record, cookie: sessionCookie(generated.token), token: generated.token };
}
export async function authenticateSession(token: string, epoch: number, now = new Date()) {
  const record = await findSession(sessionTokenHash(token));
  return record && sessionActive(record, epoch, now) ? record : undefined;
}
export async function revokeSession(token: string) {
  await deleteSession(sessionTokenHash(token));
}
export async function rotateSession(
  token: string,
  userId: string,
  sessionEpoch: number,
  now = new Date(),
) {
  await revokeSession(token);
  return issueSession(userId, sessionEpoch, now);
}
