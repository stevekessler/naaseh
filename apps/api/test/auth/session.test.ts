import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionActive } from '@naaseh/domain';
import { newSession, sessionCookie } from '../../src/auth/session.js';
import { requireMutationSecurity, validCsrf, validOrigin } from '../../src/shared/security.js';

const repository = vi.hoisted(() => ({
  saveSession: vi.fn(),
  findSession: vi.fn(),
  deleteSession: vi.fn(),
}));
vi.mock('../../src/auth/session-repository.js', () => repository);
const { authenticateSession, issueSession, revokeSession, rotateSession } = await import(
  '../../src/auth/session-service.js'
);

describe('opaque server-side sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates random opaque tokens and hardened host cookies', () => {
    const first = newSession(new Date('2026-01-01T00:00:00Z'));
    const second = newSession(new Date('2026-01-01T00:00:00Z'));
    expect(first.token).not.toBe(second.token);
    expect(first.token).not.toContain(first.tokenHash);
    expect(sessionCookie(first.token)).toContain('__Host-naaseh=');
    expect(sessionCookie(first.token)).toContain('Path=/; Secure; HttpOnly; SameSite=Strict');
  });

  it('enforces idle, absolute, revocation, and session-epoch expiry', () => {
    const record = {
      id: 's',
      userId: 'u',
      csrfToken: 'x'.repeat(32),
      sessionEpoch: 1,
      createdAt: '2026-01-01T00:00:00Z',
      idleExpiresAt: '2026-01-01T01:00:00Z',
      absoluteExpiresAt: '2026-01-02T00:00:00Z',
    };
    expect(sessionActive(record, 1, new Date('2026-01-01T00:30:00Z'))).toBe(true);
    expect(sessionActive(record, 2, new Date('2026-01-01T00:30:00Z'))).toBe(false);
    expect(sessionActive(record, 1, new Date('2026-01-01T01:00:00Z'))).toBe(false);
    expect(
      sessionActive(
        { ...record, revokedAt: '2026-01-01T00:10:00Z' },
        1,
        new Date('2026-01-01T00:30:00Z'),
      ),
    ).toBe(false);
  });

  it('issues, authenticates, rotates, and revokes only hashed tokens', async () => {
    const issued = await issueSession('u', 3, new Date('2026-01-01T00:00:00Z'));
    expect(repository.saveSession).toHaveBeenCalledWith(
      expect.not.stringContaining(issued.token),
      expect.objectContaining({ userId: 'u', sessionEpoch: 3 }),
    );
    repository.findSession.mockResolvedValueOnce(issued.record);
    expect(await authenticateSession(issued.token, 3, new Date('2026-01-01T00:01:00Z'))).toEqual(
      issued.record,
    );
    await rotateSession(issued.token, 'u', 3, new Date('2026-01-01T00:02:00Z'));
    await revokeSession(issued.token);
    expect(repository.deleteSession).toHaveBeenCalledTimes(2);
  });

  it('requires an allowed Origin and constant-time CSRF match for mutations', () => {
    const csrf = 'c'.repeat(32);
    expect(validOrigin('http://localhost:4173')).toBe(true);
    expect(validCsrf(csrf, csrf)).toBe(true);
    expect(() => requireMutationSecurity('https://evil.example', csrf, csrf)).toThrow(
      'Request rejected.',
    );
    expect(() => requireMutationSecurity('http://localhost:4173', csrf, 'wrong')).toThrow(
      'Request rejected.',
    );
  });
});
