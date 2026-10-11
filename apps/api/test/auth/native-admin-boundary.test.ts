import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('native administrator boundary', () => {
  beforeEach(() => {
    mocks.findSession.mockResolvedValue({
      userId: 'admin',
      csrfToken: 'csrf',
      sessionEpoch: 1,
      idleExpiresAt: new Date(Date.now() + 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 120_000).toISOString(),
    });
    mocks.userById.mockResolvedValue({
      active: true,
      role: 'admin',
      tfaStatus: 'enabled',
      sessionEpoch: 1,
    });
    mocks.listUserMemberships.mockResolvedValue([]);
  });
  it('returns identity and ordinary authorization context without protected-data or native admin capabilities', async () => {
    const result = await handler(
      { cookies: ['__Host-naaseh=token'], headers: {}, rawPath: '/api/v1/sync/bootstrap' } as never,
      {} as never,
      vi.fn(),
    );
    expect(result).toMatchObject({
      isAuthorized: true,
      context: { userId: 'admin', role: 'admin' },
    });
    const context = (result as { context: Record<string, unknown> }).context;
    expect(context).not.toHaveProperty('nativeAdmin');
    expect(context).not.toHaveProperty('protectedDataAccess');
    expect(context).not.toHaveProperty('recoveryOperator');
  });
});
