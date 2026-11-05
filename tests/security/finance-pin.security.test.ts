import { createHash } from 'node:crypto';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { describe, expect, it, vi } from 'vitest';
import { FinanceSecurityRepository } from '../../apps/api/src/auth/finance-security-repository.js';
import { createFinanceSecurityService } from '../../apps/api/src/auth/finance-security-service.js';
import { createFinanceUnlockGuard } from '../../apps/api/src/finance/finance-unlock-guard.js';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import { FinanceRouteRegistry } from '../../apps/api/src/finance/handlers.js';
import { json } from '../../apps/api/src/shared/http.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

function setup() {
  const f = financePersistenceFixture();
  let now = Date.parse('2026-11-01T18:00:00Z');
  const context = { userId: 'pin-owner', sessionHash: 'a'.repeat(64) };
  const userKey = { PK: 'USER#pin-owner', SK: 'PROFILE' };
  const sessionKey = { PK: `SESSION#${context.sessionHash}`, SK: 'SESSION' };
  const preferenceKey = { PK: userKey.PK, SK: 'FINANCE_SECURITY' };
  f.rows.set(f.key(userKey), {
    ...userKey,
    data: {
      id: context.userId,
      username: 'pin-owner',
      displayName: 'Synthetic Owner',
      active: true,
      role: 'user',
      version: 1,
      sessionEpoch: 1,
      credentialVersion: 1,
      tfaStatus: 'disabled',
      passwordHash: 'test:password-current:pepper-old',
      pinHash: 'independent-recovery-pin',
      pepperVersion: 'old-version',
    },
  });
  f.rows.set(f.key(sessionKey), {
    ...sessionKey,
    data: {
      id: 'synthetic-session',
      userId: context.userId,
      csrfToken: 'c'.repeat(32),
      sessionEpoch: 1,
      createdAt: new Date(now).toISOString(),
      idleExpiresAt: new Date(now + 10 * 60_000).toISOString(),
      absoluteExpiresAt: new Date(now + 10 * 60_000).toISOString(),
    },
  });
  const repository = new FinanceSecurityRepository(
    () => new FinanceUnitOfWork(f.persistence, 'table'),
    () => now,
  );
  const loadPepper = vi.fn(async (version?: string) => ({
    value: version === 'old-version' ? 'pepper-old' : 'pepper-new',
    version: version ?? 'new-version',
  }));
  const verify = vi.fn(
    async (hash: string | undefined, value: string, pepper: string) =>
      hash === `test:${value}:${pepper}`,
  );
  const hashPin = vi.fn(async (value: string, pepper: string) => `test:${value}:${pepper}`);
  const service = createFinanceSecurityService({
    repository,
    loadPepper,
    verify,
    hashPin,
    now: () => now,
  });
  const enrollment = {
    currentPassword: 'password-current',
    newPin: '001234',
    confirmPin: '001234',
    requirePin: true,
    expectedRevision: 0,
  };
  return {
    ...f,
    service,
    repository,
    context,
    userKey,
    sessionKey,
    preferenceKey,
    enrollment,
    loadPepper,
    verify,
    hashPin,
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

describe('Finance PIN server privacy and durable verification', () => {
  it('verifies the canonical pepper version and enrolls separately from recovery credentials', async () => {
    const f = setup();
    expect(await f.service.update(f.context, f.enrollment)).toEqual({
      requirePin: true,
      enrolled: true,
      revision: 1,
    });
    expect(f.loadPepper).toHaveBeenCalledWith('old-version');
    expect(f.hashPin).toHaveBeenCalledWith('finance-pin-v1:001234', 'pepper-old');
    expect(f.rows.get(f.key(f.preferenceKey))).toMatchObject({
      financePinHash: 'test:finance-pin-v1:001234:pepper-old',
      financePepperVersion: 'old-version',
    });
    expect((f.rows.get(f.key(f.userKey))!.data as any).pinHash).toBe('independent-recovery-pin');
    expect(await f.service.get(f.context)).toEqual({
      requirePin: true,
      enrolled: true,
      revision: 1,
    });
  });
  it('denies cross-user session context even for a caller claiming to be an administrator', async () => {
    const f = setup();
    f.rows.set(f.key({ PK: 'USER#other', SK: 'PROFILE' }), {
      PK: 'USER#other',
      SK: 'PROFILE',
      data: {
        ...(f.rows.get(f.key(f.userKey))!.data as any),
        id: 'other',
        role: 'admin',
        tfaStatus: 'enabled',
      },
    });
    await expect(
      f.service.update({ ...f.context, userId: 'other' }, f.enrollment),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.rows.has(f.key(f.preferenceKey))).toBe(false);
  });
  it('does not enable, replace or disable protection on an incorrect password', async () => {
    const f = setup();
    await expect(
      f.service.update(f.context, { ...f.enrollment, currentPassword: 'wrong' }),
    ).rejects.toMatchObject({ status: 403 });
    expect(f.rows.has(f.key(f.preferenceKey))).toBe(false);
    await expect(
      f.service.setRequirement(f.context, {
        currentPassword: 'password-current',
        requirePin: true,
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await f.service.update(f.context, f.enrollment);
    await expect(
      f.service.setRequirement(f.context, {
        currentPassword: 'wrong',
        requirePin: false,
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await f.service.get(f.context)).toMatchObject({ requirePin: true, revision: 1 });
  });
  it('persists a thirty-second fifth-failure delay and doubles it up to thirty minutes', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    for (let count = 1; count <= 12; count++) {
      const delay = count < 5 ? 0 : Math.min(1_800_000, 30_000 * 2 ** (count - 5));
      await expect(
        f.service.unlock(f.context, { pin: '999999', tabNonce: 't'.repeat(32) }),
      ).rejects.toMatchObject({
        status: delay ? 429 : 403,
        ...(delay ? { retryAfterSeconds: delay / 1000 } : {}),
      });
      if (delay) {
        const calls = f.verify.mock.calls.length;
        await expect(
          f.service.unlock(f.context, { pin: '001234', tabNonce: 't'.repeat(32) }),
        ).rejects.toMatchObject({ status: 429 });
        expect(f.verify.mock.calls.length).toBe(calls);
        f.advance(delay);
        // Keep the session alive independently; this does not reset Finance throttling.
        const row = f.rows.get(f.key(f.sessionKey))!;
        (row.data as any).idleExpiresAt = (row.data as any).absoluteExpiresAt = new Date(
          f.now() + 60 * 60_000,
        ).toISOString();
      }
    }
  });
  it('stores only a random grant digest bound to user, canonical session, epoch, revision and tab', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    const result = await f.service.unlock(f.context, { pin: '001234', tabNonce: 't'.repeat(32) });
    expect(result.grant).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(result.expiresAt)).toBe(f.now() + 10 * 60_000);
    const digest = createHash('sha256').update(result.grant).digest('hex');
    const row = f.rows.get(f.key({ PK: `FINANCE_GRANT#${digest}`, SK: 'CURRENT' }));
    expect(row).toMatchObject({
      userId: f.context.userId,
      sessionHash: f.context.sessionHash,
      sessionId: 'synthetic-session',
      sessionEpoch: 1,
      securityRevision: 1,
      tabNonce: 't'.repeat(32),
    });
    expect(JSON.stringify([...f.rows.values()])).not.toContain(result.grant);
    await f.service.revoke(f.context, result.grant);
    expect(f.rows.has(f.key({ PK: `FINANCE_GRANT#${digest}`, SK: 'CURRENT' }))).toBe(false);
    await f.service.revoke(f.context, result.grant);
  });
  it('reserves a durable verification lease so concurrent guesses cannot bypass the failure counter', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    let release!: (valid: boolean) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    f.verify.mockImplementationOnce(async () => {
      entered();
      return new Promise<boolean>((resolve) => {
        release = resolve;
      });
    });
    const first = f.service.unlock(f.context, { pin: '999999', tabNonce: 't'.repeat(32) });
    const rejected = expect(first).rejects.toMatchObject({ status: 403 });
    await started;
    const calls = f.verify.mock.calls.length;
    await expect(
      f.service.unlock(f.context, { pin: '999999', tabNonce: 't'.repeat(32) }),
    ).rejects.toMatchObject({ status: 429 });
    expect(f.verify.mock.calls.length).toBe(calls);
    release(false);
    await rejected;
  });
  it('rejects a password-reset race before publishing new Finance security state', async () => {
    const f = setup();
    f.verify.mockImplementationOnce(async () => {
      (f.rows.get(f.key(f.userKey))!.data as any).sessionEpoch = 2;
      return true;
    });
    await expect(f.service.update(f.context, f.enrollment)).rejects.toMatchObject({ status: 401 });
    expect(f.rows.has(f.key(f.preferenceKey))).toBe(false);
  });

  it('rechecks canonical session epoch and active state even when legacy Finance has no PIN', async () => {
    const f = setup();
    const guard = createFinanceUnlockGuard({
      read: async (key) => f.rows.get(f.key(key)),
      now: f.now,
    });
    expect(await guard(f.context)).toEqual({
      requirePin: false,
      securityRevision: 0,
      sessionEpoch: 1,
    });
    (f.rows.get(f.key(f.userKey))!.data as any).active = false;
    await expect(guard(f.context)).rejects.toMatchObject({ status: 401 });
  });

  it('gives administrators no missing-grant bypass for their own protected Finance', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    const profile = f.rows.get(f.key(f.userKey))!.data as any;
    profile.role = 'admin';
    profile.tfaStatus = 'enabled';
    const guard = createFinanceUnlockGuard({
      read: async (key) => f.rows.get(f.key(key)),
      now: f.now,
    });
    await expect(guard(f.context)).rejects.toMatchObject({ status: 403, code: 'finance_locked' });
  });

  it('rejects mismatched owner, tab, session, revision or excessive/expired grant lifetimes', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    const unlocked = await f.service.unlock(f.context, { pin: '001234', tabNonce: 't'.repeat(32) });
    const guard = createFinanceUnlockGuard({
      read: async (key) => f.rows.get(f.key(key)),
      now: f.now,
    });
    const request = { ...f.context, grant: unlocked.grant, tabNonce: 't'.repeat(32) };
    expect(await guard(request)).toMatchObject({ requirePin: true, securityRevision: 1 });
    await expect(guard({ ...request, tabNonce: 'x'.repeat(32) })).rejects.toMatchObject({
      code: 'finance_locked',
    });
    const digest = createHash('sha256').update(unlocked.grant).digest('hex');
    const key = { PK: `FINANCE_GRANT#${digest}`, SK: 'CURRENT' };
    const original = structuredClone(f.rows.get(f.key(key))!);
    for (const change of [
      { userId: 'other' },
      { sessionHash: 'b'.repeat(64) },
      { sessionId: 'other' },
      { securityRevision: 2 },
      { sessionEpoch: 2 },
      { expiresAtMs: f.now() },
      { createdAt: f.now() - 31 * 60_000 },
    ]) {
      f.rows.set(f.key(key), { ...original, ...change });
      await expect(guard(request)).rejects.toMatchObject({ code: 'finance_locked' });
    }
  });

  it('invalidates a grant on password-reset epoch change without altering Finance protection', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    const unlocked = await f.service.unlock(f.context, { pin: '001234', tabNonce: 't'.repeat(32) });
    const preference = structuredClone(f.rows.get(f.key(f.preferenceKey)));
    (f.rows.get(f.key(f.userKey))!.data as any).sessionEpoch = 2;
    const guard = createFinanceUnlockGuard({
      read: async (key) => f.rows.get(f.key(key)),
      now: f.now,
    });
    await expect(
      guard({ ...f.context, grant: unlocked.grant, tabNonce: 't'.repeat(32) }),
    ).rejects.toMatchObject({ status: 401 });
    expect(f.rows.get(f.key(f.preferenceKey))).toEqual(preference);
  });

  it('loads only safe canonical profile fields across the Finance boundary', async () => {
    const f = setup();
    let expectedCount = 3;
    const send = vi.spyOn(dynamodb, 'send').mockImplementation(async (command) => {
      const input = command.input as {
        TransactItems: Array<{
          Get: { Key: { PK: string; SK: string }; ProjectionExpression?: string };
        }>;
      };
      expect(input.TransactItems).toHaveLength(expectedCount);
      expect(input.TransactItems[0]!.Get.ProjectionExpression).toBeTruthy();
      expect(input.TransactItems[0]!.Get.ProjectionExpression).not.toMatch(
        /password|pinHash|pepper/i,
      );
      return {
        Responses: input.TransactItems.map(({ Get }) => ({ Item: f.rows.get(f.key(Get.Key)) })),
      };
    });
    try {
      await createFinanceUnlockGuard({ now: f.now })(f.context);
      expect(send).toHaveBeenCalledOnce();
      await f.service.update(f.context, f.enrollment);
      const unlocked = await f.service.unlock(f.context, {
        pin: '001234',
        tabNonce: 't'.repeat(32),
      });
      expectedCount = 4;
      const request = { ...f.context, grant: unlocked.grant, tabNonce: 't'.repeat(32) };
      await createFinanceUnlockGuard({ now: f.now })(request);
      expect(send).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(send.mock.calls[1]![0].input)).not.toContain(unlocked.grant);
      send.mockResolvedValueOnce({ Responses: [{}] });
      await expect(createFinanceUnlockGuard({ now: f.now })(request)).rejects.toMatchObject({
        status: 503,
      });
      send.mockRejectedValueOnce(new Error('private storage details'));
      await expect(createFinanceUnlockGuard({ now: f.now })(request)).rejects.toMatchObject({
        status: 503,
        code: 'finance_security_unavailable',
      });
    } finally {
      send.mockRestore();
    }
  });

  it('guards a Finance HTTP read before invoking any protected route', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    const route = vi.fn(async () => json(200, { secret: 'protected-account' }));
    const registry = new FinanceRouteRegistry().register('GET', '/api/v1/finance/accounts', route);
    const guard = createFinanceUnlockGuard({
      read: async (key) => f.rows.get(f.key(key)),
      now: f.now,
    });
    const handler = createFinanceHandler(registry, guard);
    const result = await handler({
      rawPath: '/api/v1/finance/accounts',
      headers: {},
      requestContext: {
        requestId: 'gate-read',
        http: { method: 'GET' },
        authorizer: { lambda: f.context },
      },
    } as any);
    expect(result).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(result)).not.toContain('protected-account');
    expect(route).not.toHaveBeenCalled();
  });

  it('withholds a completed HTTP read if the PIN revision changes during route execution', async () => {
    const f = setup();
    await f.service.update(f.context, f.enrollment);
    const unlocked = await f.service.unlock(f.context, { pin: '001234', tabNonce: 't'.repeat(32) });
    const registry = new FinanceRouteRegistry().register(
      'GET',
      '/api/v1/finance/accounts',
      async () => {
        f.rows.get(f.key(f.preferenceKey))!.revision = 2;
        return json(200, { secret: 'protected-account' });
      },
    );
    const guard = createFinanceUnlockGuard({
      read: async (key) => f.rows.get(f.key(key)),
      now: f.now,
    });
    const result = await createFinanceHandler(
      registry,
      guard,
    )({
      rawPath: '/api/v1/finance/accounts',
      headers: { 'x-finance-unlock': unlocked.grant, 'x-finance-tab': 't'.repeat(32) },
      requestContext: {
        requestId: 'gate-read',
        http: { method: 'GET' },
        authorizer: { lambda: f.context },
      },
    } as any);
    expect(result).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(result)).not.toContain('protected-account');
  });
});
