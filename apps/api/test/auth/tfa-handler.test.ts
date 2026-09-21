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
  enableFactor: vi.fn(),
  decryptTfaSecret: vi.fn(),
  encryptTfaSecret: vi.fn(),
  verifyTotp: vi.fn(),
  issueSession: vi.fn(),
  authenticateSession: vi.fn(),
  findSession: vi.fn(),
  sessionTokenHash: vi.fn((token: string) => `digest-${token}`),
  issueTrustedDevice: vi.fn(),
  isTrustedDevice: vi.fn(),
  forgetTrustedDevice: vi.fn(),
  listRememberedBrowsers: vi.fn(),
  revokeRememberedBrowser: vi.fn(),
  renameRememberedBrowser: vi.fn(),
  isCurrentRememberedBrowser: vi.fn(),
  userByUsername: vi.fn(),
  loadPepper: vi.fn(),
  verifyOrDummy: vi.fn(),
  durableCanAttempt: vi.fn(),
  clearDurableFailures: vi.fn(),
  registerDurableFailure: vi.fn(),
  putLoginTransaction: vi.fn(),
}));
vi.mock('../../src/auth/login-transaction-repository.js', () => mocks);
vi.mock('../../src/auth/user-repository.js', () => mocks);
vi.mock('../../src/auth/session-service.js', () => mocks);
vi.mock('../../src/auth/session-repository.js', () => mocks);
vi.mock('../../src/auth/tfa-service.js', () => ({
  createTfaService: () => mocks,
  requiredTfaNextStep: (user: { tfaStatus: string }) =>
    user.tfaStatus === 'enabled' ? 'tfa_challenge' : undefined,
}));
vi.mock('../../src/auth/trusted-device.js', () => ({
  TRUSTED_DEVICE_COOKIE_NAME: '__Host-naaseh-trusted-device',
  issueTrustedDevice: mocks.issueTrustedDevice,
  isTrustedDevice: mocks.isTrustedDevice,
  forgetTrustedDevice: mocks.forgetTrustedDevice,
  listRememberedBrowsers: mocks.listRememberedBrowsers,
  revokeRememberedBrowser: mocks.revokeRememberedBrowser,
  renameRememberedBrowser: mocks.renameRememberedBrowser,
  isCurrentRememberedBrowser: mocks.isCurrentRememberedBrowser,
  trustedDeviceCookie: (token: string, maxAge = 2_592_000) =>
    `__Host-naaseh-trusted-device=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${maxAge}`,
}));
vi.mock('../../src/auth/password.js', () => mocks);
vi.mock('../../src/auth/rate-limit.js', () => mocks);
vi.mock('../../src/auth/tfa-crypto.js', () => mocks);
const { handler } = await import('../../src/auth/handler.js');
const invoke = async (method: string, rememberDevice = true) =>
  (await handler(
    {
      rawPath: '/api/v1/auth/tfa/challenge',
      headers: { origin: 'http://localhost:4173' },
      cookies: ['__Host-naaseh-preauth=pending'],
      body: JSON.stringify({
        method,
        code: method === 'totp' ? '123456' : 'ABCD-EFGH-IJKL',
        rememberDevice,
      }),
      requestContext: { requestId: 'test', http: { method: 'POST' } },
    } as never,
    {} as never,
    vi.fn(),
  )) as APIGatewayProxyStructuredResultV2;

const invokeLogin = async (cookies: string[] = []) =>
  (await handler(
    {
      rawPath: '/api/v1/auth/login',
      headers: { origin: 'http://localhost:4173' },
      cookies,
      body: JSON.stringify({ username: 'admin', password: 'password' }),
      requestContext: { requestId: 'test-login', http: { method: 'POST', sourceIp: '127.0.0.1' } },
    } as never,
    {} as never,
    vi.fn(),
  )) as APIGatewayProxyStructuredResultV2;

const invokeEnrollmentConfirmation = async () =>
  (await handler(
    {
      rawPath: '/api/v1/auth/tfa/enrollment/confirm',
      headers: { origin: 'http://localhost:4173' },
      cookies: ['__Host-naaseh-preauth=pending'],
      body: JSON.stringify({ code: '123456', rememberDevice: true }),
      requestContext: { requestId: 'test-enroll', http: { method: 'POST' } },
    } as never,
    {} as never,
    vi.fn(),
  )) as APIGatewayProxyStructuredResultV2;

const invokeTrustedDeviceSettings = async (
  method: 'GET' | 'PATCH' | 'DELETE',
  id?: string,
  csrf = 'csrf',
) =>
  (await handler(
    {
      rawPath: `/api/v1/profile/security/trusted-devices${id ? `/${id}` : ''}`,
      headers: { origin: 'http://localhost:4173', 'x-csrf-token': csrf },
      cookies: ['__Host-naaseh=session', '__Host-naaseh-trusted-device=known-device'],
      ...(method === 'PATCH' ? { body: JSON.stringify({ label: 'Steve’s MacBook Pro' }) } : {}),
      requestContext: { requestId: 'test-settings', http: { method } },
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
  mocks.enableFactor.mockResolvedValue(['recovery-code']);
  mocks.decryptTfaSecret.mockResolvedValue('secret');
  mocks.verifyTotp.mockReturnValue({ counter: 1 });
  mocks.issueTrustedDevice.mockResolvedValue(
    '__Host-naaseh-trusted-device=trusted; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000',
  );
  mocks.forgetTrustedDevice.mockResolvedValue(
    '__Host-naaseh-trusted-device=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0',
  );
  mocks.isTrustedDevice.mockResolvedValue(false);
  mocks.userByUsername.mockResolvedValue({
    id: 'admin',
    username: 'admin',
    displayName: 'Admin',
    role: 'admin',
    active: true,
    tfaStatus: 'enabled',
    sessionEpoch: 2,
    credentialVersion: 1,
    passwordHash: 'hash',
  });
  mocks.loadPepper.mockResolvedValue({ value: 'pepper' });
  mocks.verifyOrDummy.mockResolvedValue(true);
  mocks.durableCanAttempt.mockResolvedValue(true);
  mocks.issueSession.mockResolvedValue({
    cookie: sessionCookie('new-session'),
    record: { csrfToken: 'csrf' },
  });
  mocks.findSession.mockResolvedValue({ userId: 'admin', csrfToken: 'csrf' });
  mocks.authenticateSession.mockResolvedValue({ userId: 'admin', csrfToken: 'csrf' });
  mocks.listRememberedBrowsers.mockResolvedValue([]);
  mocks.revokeRememberedBrowser.mockResolvedValue(true);
  mocks.renameRememberedBrowser.mockResolvedValue(true);
  mocks.isCurrentRememberedBrowser.mockReturnValue(false);
});

describe('TFA HTTP session cookies', () => {
  it.each(['totp', 'recovery_code'])(
    'keeps the %s session alive while expiring pre-auth',
    async (method) => {
      const response = await invoke(method);
      expect(response.statusCode).toBe(200);
      expect(response.headers?.['set-cookie']).toBeUndefined();
      expect(response.cookies).toEqual([
        sessionCookie('new-session'),
        preAuthCookie('', 0),
        '__Host-naaseh-trusted-device=trusted; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000',
      ]);
      expect(response.cookies?.[0]).toContain('Max-Age=2592000');
      expect(response.cookies?.[0]).not.toContain('Max-Age=0');
      expect(response.cookies?.[1]).toContain('Max-Age=0');
      expect(mocks.consumeLoginTransaction).toHaveBeenCalledWith('digest-pending');
      expect(mocks.issueSession).toHaveBeenCalledWith('admin', 2);
      expect(mocks.issueTrustedDevice).toHaveBeenCalled();
    },
  );

  it('does not remember the browser when declined', async () => {
    const response = await invoke('totp', false);
    expect(response.statusCode).toBe(200);
    expect(response.cookies?.[2]).toContain('Max-Age=0');
    expect(mocks.issueTrustedDevice).not.toHaveBeenCalled();
  });

  it('remembers the browser after initial factor enrollment', async () => {
    mocks.getLoginTransaction.mockResolvedValue({
      userId: 'admin',
      purpose: 'tfa_enrollment',
      pendingSecretCiphertext: 'encrypted',
    });
    const response = await invokeEnrollmentConfirmation();
    expect(response.statusCode).toBe(200);
    expect(response.cookies?.[0]).toBe(sessionCookie('new-session'));
    expect(response.cookies?.[1]).toBe(preAuthCookie('', 0));
    expect(response.cookies?.[2]).toContain('Max-Age=2592000');
    expect(mocks.issueTrustedDevice).toHaveBeenCalled();
  });

  it('still signs in after valid TFA when trusted-device storage is unavailable', async () => {
    mocks.issueTrustedDevice.mockRejectedValue(new Error('storage unavailable'));
    const response = await invoke('totp');
    expect(response.statusCode).toBe(200);
    expect(response.cookies?.[2]).toContain('Max-Age=0');
    expect(mocks.issueSession).toHaveBeenCalled();
  });

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

describe('remembered browser sign-in', () => {
  it('requires a password but skips the TFA challenge for a trusted browser', async () => {
    mocks.isTrustedDevice.mockResolvedValue(true);
    const response = await invokeLogin(['__Host-naaseh-trusted-device=known-device']);
    expect(response.statusCode).toBe(200);
    expect(response.cookies).toEqual([sessionCookie('new-session'), preAuthCookie('', 0)]);
    expect(mocks.isTrustedDevice).toHaveBeenCalledWith(
      'known-device',
      expect.objectContaining({ id: 'admin' }),
      expect.any(Date),
      undefined,
    );
    expect(mocks.putLoginTransaction).not.toHaveBeenCalled();
  });

  it('requires TFA when the browser is not trusted', async () => {
    const response = await invokeLogin(['__Host-naaseh-trusted-device=expired-device']);
    expect(response.statusCode).toBe(202);
    expect(mocks.putLoginTransaction).toHaveBeenCalledOnce();
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it('falls back to a TFA challenge if trusted-device lookup is unavailable', async () => {
    mocks.isTrustedDevice.mockRejectedValue(new Error('storage unavailable'));
    const response = await invokeLogin(['__Host-naaseh-trusted-device=known-device']);
    expect(response.statusCode).toBe(202);
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });

  it('does not check remembered-device trust before verifying the password', async () => {
    mocks.verifyOrDummy.mockResolvedValue(false);
    const response = await invokeLogin(['__Host-naaseh-trusted-device=known-device']);
    expect(response.statusCode).toBe(401);
    expect(mocks.isTrustedDevice).not.toHaveBeenCalled();
    expect(mocks.issueSession).not.toHaveBeenCalled();
  });
});

describe('remembered browser settings', () => {
  const id = 'a'.repeat(64);

  it('lists only devices belonging to the authenticated account', async () => {
    const response = await invokeTrustedDeviceSettings('GET');
    expect(response.statusCode).toBe(200);
    expect(mocks.listRememberedBrowsers).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'admin' }),
      'known-device',
      expect.any(Date),
      undefined,
    );
  });

  it('requires CSRF protection to forget a remote browser', async () => {
    const denied = await invokeTrustedDeviceSettings('DELETE', id, 'wrong');
    expect(denied.statusCode).toBe(403);
    expect(mocks.revokeRememberedBrowser).not.toHaveBeenCalled();
    const response = await invokeTrustedDeviceSettings('DELETE', id);
    expect(response.statusCode).toBe(200);
    expect(mocks.revokeRememberedBrowser).toHaveBeenCalledWith('admin', id);
    expect(response.cookies).toBeUndefined();
  });

  it('clears only this browser’s trust cookie when forgetting it', async () => {
    mocks.isCurrentRememberedBrowser.mockReturnValue(true);
    const response = await invokeTrustedDeviceSettings('DELETE', id);
    expect(response.cookies?.[0]).toContain('Max-Age=0');
  });

  it('renames a known browser but rejects one not owned by the user', async () => {
    const response = await invokeTrustedDeviceSettings('PATCH', id);
    expect(response.statusCode).toBe(200);
    expect(mocks.renameRememberedBrowser).toHaveBeenCalledWith('admin', id, 'Steve’s MacBook Pro');
    mocks.renameRememberedBrowser.mockResolvedValue(false);
    expect((await invokeTrustedDeviceSettings('PATCH', id)).statusCode).toBe(404);
  });
});
