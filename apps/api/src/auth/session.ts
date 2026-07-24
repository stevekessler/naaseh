import { createHash, randomBytes } from 'node:crypto';
export interface NewSession {
  token: string;
  tokenHash: string;
  csrfToken: string;
  expiresAt: string;
}
export function newSession(now = new Date()): NewSession {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
    csrfToken: randomBytes(24).toString('base64url'),
    expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString(),
  };
}
export const sessionCookie = (token: string, maxAge = 28_800) =>
  `__Host-naaseh=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`;
