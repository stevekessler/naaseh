import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  refreshIdleExpiry: vi.fn(),
  userById: vi.fn(),
  listUserMemberships: vi.fn(),
}));
vi.mock('../../src/auth/session-repository.js', () => mocks);
vi.mock('../../src/auth/user-repository.js', () => mocks);
vi.mock('../../src/groups/group-repository.js', () => mocks);
const { handler } = await import('../../src/auth/authorizer.js');
const invoke = (event: object) => handler(event as never, {} as never, vi.fn());
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findSession.mockResolvedValue({
    userId: 'steve',
    csrfToken: 'csrf',
    sessionEpoch: 1,
    idleExpiresAt: new Date(Date.now() + 25 * 60_000).toISOString(),
    absoluteExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  mocks.userById.mockResolvedValue({
    active: true,
    role: 'admin',
    tfaStatus: 'enabled',
    sessionEpoch: 1,
  });
  mocks.listUserMemberships.mockResolvedValue([
    { status: 'active', groupId: 'g1' },
    { status: 'removed', groupId: 'g2' },
  ]);
});
describe('API Gateway v2 authenticated routes', () => {
  it.each([
    '/admin/users',
    '/sync/bootstrap',
    '/journal/key-envelope',
    '/groups',
    '/users/directory',
    '/profile/security',
  ])('accepts cookie-array sessions on %s', async (path) => {
    expect(
      await invoke({
        cookies: ['other=value', '__Host-naaseh=opaque-token'],
        headers: {},
        rawPath: `/api/v1${path}`,
      }),
    ).toMatchObject({
      isAuthorized: true,
      context: { userId: 'steve', role: 'admin', groupIds: 'g1' },
    });
    expect(mocks.findSession).toHaveBeenCalledWith(
      createHash('sha256').update('opaque-token').digest('hex'),
    );
  });
  it('retains legacy header support', async () => {
    expect(await invoke({ headers: { cookie: '__Host-naaseh=token' } })).toMatchObject({
      isAuthorized: true,
    });
  });
  it('rejects absent cookies without a database lookup', async () => {
    expect(await invoke({})).toEqual({ isAuthorized: false });
    expect(mocks.findSession).not.toHaveBeenCalled();
  });
  it.each([
    { active: false, sessionEpoch: 1 },
    { active: true, sessionEpoch: 2 },
    { active: true, sessionEpoch: 1, role: 'admin', tfaStatus: 'enrollment_required' },
  ])('does not bypass account protections for %j', async (user) => {
    mocks.userById.mockResolvedValue(user);
    expect(await invoke({ cookies: ['__Host-naaseh=token'] })).toEqual({ isAuthorized: false });
  });
  it('rejects revoked sessions in cookie arrays', async () => {
    mocks.findSession.mockResolvedValue({ revokedAt: new Date().toISOString() });
    expect(await invoke({ cookies: ['__Host-naaseh=token'] })).toEqual({ isAuthorized: false });
  });
});
