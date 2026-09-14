import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyStructuredResultV2 } from 'aws-lambda';
import { preAuthCookie, sessionCookie } from '../../src/auth/session.js';

const mocks = vi.hoisted(() => ({
  getLoginTransaction: vi.fn(),
  consumeLoginTransaction: vi.fn(),
  registerLoginTransactionFailure: vi.fn(),
  userById: vi.fn(),
  changeUserSecurity: vi.fn(),
  verifyFactor: vi.fn(),
  issueSession: vi.fn(),
  sessionTokenHash: vi.fn((token: string) => `digest-${token}`),
}));
vi.mock('../../src/auth/login-transaction-repository.js', () => mocks);
vi.mock('../../src/auth/user-repository.js', () => mocks);
vi.mock('../../src/auth/session-service.js', () => mocks);
vi.mock('../../src/auth/tfa-service.js', () => ({ createTfaService: () => mocks }));
const { handler } = await import('../../src/auth/handler.js');
const invoke = async (method: string) =>
  (await handler(
    {
      rawPath: '/api/v1/auth/tfa/challenge',
      headers: { origin: 'http://localhost:4173' },
      cookies: ['__Host-naaseh-preauth=pending'],
      body: JSON.stringify({ method, code: method === 'totp' ? '123456' : 'ABCD-EFGH-IJKL' }),
      requestContext: { requestId: 'test', http: { method: 'POST' } },
    } as never,
    {} as never,
    vi.fn(),
  )) as APIGatewayProxyStructuredResultV2;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getLoginTransaction.mockResolvedValue({
    userId: 'admin',
    purpose: 'tfa_challenge',
    sessionEpoch: 2,
    credentialVersion: 1,
  });
  mocks.userById.mockResolvedValue({
    id: 'admin',
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
    active: true,
    tfaStatus: 'enabled',
    sessionEpoch: 2,
    credentialVersion: 1,
  });
  mocks.verifyFactor.mockResolvedValue(true);
  mocks.issueSession.mockResolvedValue({
    cookie: sessionCookie('new-session'),
    record: { csrfToken: 'csrf' },
  });
});

describe('TFA HTTP session cookies', () => {
  it.each(['totp', 'recovery_code'])(
    'keeps the %s session alive while expiring pre-auth',
    async (method) => {
      const response = await invoke(method);
      expect(response.statusCode).toBe(200);
      expect(response.headers?.['set-cookie']).toBeUndefined();
      expect(response.cookies).toEqual([sessionCookie('new-session'), preAuthCookie('', 0)]);
      expect(response.cookies?.[0]).toContain('Max-Age=2592000');
      expect(response.cookies?.[0]).not.toContain('Max-Age=0');
      expect(response.cookies?.[1]).toContain('Max-Age=0');
      expect(mocks.consumeLoginTransaction).toHaveBeenCalledWith('digest-pending');
      expect(mocks.issueSession).toHaveBeenCalledWith('admin', 2);
    },
  );

  it.each(['totp', 'recovery_code'])(
    'does not issue a session for an invalid %s',
    async (method) => {
      mocks.verifyFactor.mockResolvedValue(false);
      const response = await invoke(method);
      expect(response.statusCode).toBe(401);
      expect(response.cookies).toBeUndefined();
      expect(mocks.issueSession).not.toHaveBeenCalled();
      expect(mocks.consumeLoginTransaction).not.toHaveBeenCalled();
      expect(mocks.registerLoginTransactionFailure).toHaveBeenCalledWith('digest-pending');
    },
  );
});
