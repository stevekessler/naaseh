import { describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createFinanceSecurityHttpHandler } from '../../apps/api/src/auth/finance-security-handler.js';
import { SafeApiError } from '../../apps/api/src/shared/http.js';

function fixture() {
  const preference = { requirePin: true, enrolled: true, revision: 2 };
  const service = {
    get: vi.fn(async () => preference),
    update: vi.fn(async () => preference),
    setRequirement: vi.fn(async () => preference),
    unlock: vi.fn(async () => ({
      grant: 'g'.repeat(43),
      expiresAt: '2026-11-01T18:30:00.000Z',
      securityRevision: 2,
      sessionEpoch: 1,
    })),
    revoke: vi.fn(async () => {}),
  };
  const authenticate = vi.fn(async () => ({
    userId: 'owner',
    sessionHash: 'canonical-cookie-hash',
    csrfToken: 'csrf',
  }));
  const handle = createFinanceSecurityHttpHandler({ service, authenticate });
  const event = (method = 'GET', path = '/api/v1/auth/finance-security', body?: unknown) =>
    ({
      rawPath: path,
      headers: {
        origin: 'http://localhost:4173',
        'x-csrf-token': 'csrf',
        'x-finance-unlock': 'g'.repeat(43),
      },
      requestContext: {
        requestId: 'finance-http',
        http: { method },
        authorizer: { lambda: { userId: 'forged-admin' } },
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }) as APIGatewayProxyEventV2;
  return { handle, service, authenticate, event };
}
describe('Finance security HTTP boundary', () => {
  it('uses canonical self-only cookie context and safe no-store responses', async () => {
    const f = fixture();
    const result = await f.handle(f.event());
    expect(result).toMatchObject({ statusCode: 200, headers: { 'cache-control': 'no-store' } });
    expect(f.service.get).toHaveBeenCalledWith({
      userId: 'owner',
      sessionHash: 'canonical-cookie-hash',
    });
    expect(JSON.parse((result as { body: string }).body)).toEqual({
      requirePin: true,
      enrolled: true,
      revision: 2,
    });
    f.authenticate.mockResolvedValueOnce(undefined as never);
    expect(await f.handle(f.event())).toMatchObject({ statusCode: 401 });
    expect(f.service.get).toHaveBeenCalledTimes(1);
  });
  it('rejects unsafe mutations before invoking PIN/password verification', async () => {
    const f = fixture();
    for (const method of ['PUT', 'PATCH', 'POST', 'DELETE']) {
      const path =
        method === 'POST'
          ? '/api/v1/auth/finance-unlocks'
          : method === 'DELETE'
            ? '/api/v1/auth/finance-unlocks/current'
            : '/api/v1/auth/finance-security';
      const event = f.event(method, path, {});
      event.headers.origin = 'https://untrusted.invalid';
      expect(await f.handle(event)).toMatchObject({ statusCode: 403 });
      event.headers.origin = 'http://localhost:4173';
      event.headers['x-csrf-token'] = 'wrong';
      expect(await f.handle(event)).toMatchObject({ statusCode: 403 });
    }
    for (const method of ['update', 'setRequirement', 'unlock', 'revoke'] as const)
      expect(f.service[method]).not.toHaveBeenCalled();
  });
  it('routes management/unlock/revoke methods and preserves request bindings', async () => {
    const f = fixture();
    const update = {
      currentPassword: 'proof',
      newPin: '123456',
      confirmPin: '123456',
      requirePin: true,
      expectedRevision: 1,
    };
    expect(await f.handle(f.event('PUT', undefined, update))).toMatchObject({ statusCode: 200 });
    expect(f.service.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'owner' }),
      update,
    );
    const patch = { currentPassword: 'proof', requirePin: false, expectedRevision: 2 };
    expect(await f.handle(f.event('PATCH', undefined, patch))).toMatchObject({ statusCode: 200 });
    expect(f.service.setRequirement).toHaveBeenCalledWith(expect.anything(), patch);
    const unlock = { pin: '001234', tabNonce: 't'.repeat(32) };
    expect(await f.handle(f.event('POST', '/api/v1/auth/finance-unlocks', unlock))).toMatchObject({
      statusCode: 200,
    });
    expect(f.service.unlock).toHaveBeenCalledWith(expect.anything(), unlock);
    expect(await f.handle(f.event('DELETE', '/api/v1/auth/finance-unlocks/current'))).toMatchObject(
      { statusCode: 204 },
    );
    expect(f.service.revoke).toHaveBeenCalledWith(expect.anything(), 'g'.repeat(43));
  });
  it('keeps malformed bodies, unsupported methods and internal failures safe', async () => {
    const f = fixture();
    const event = f.event('PUT');
    event.body = '{';
    expect(await f.handle(event)).toMatchObject({ statusCode: 400 });
    expect(await f.handle(f.event('POST'))).toMatchObject({ statusCode: 405 });
    expect(await f.handle(f.event('GET', '/api/v1/profile/security'))).toBeUndefined();
    f.service.get.mockRejectedValueOnce(new Error('sensitive-verifier-internal'));
    const result = await f.handle(f.event());
    expect(result).toMatchObject({ statusCode: 500, headers: { 'cache-control': 'no-store' } });
    expect(JSON.stringify(result)).not.toContain('sensitive-verifier-internal');
  });
  it('preserves durable throttling status and retry delay', async () => {
    const f = fixture();
    f.service.unlock.mockRejectedValueOnce(
      new SafeApiError(
        429,
        'finance_unlock_throttled',
        'Wait before trying Finance security again.',
        'throttled',
        true,
        30,
      ),
    );
    expect(
      await f.handle(
        f.event('POST', '/api/v1/auth/finance-unlocks', {
          pin: '123456',
          tabNonce: 't'.repeat(32),
        }),
      ),
    ).toMatchObject({
      statusCode: 429,
      headers: { 'retry-after': '30', 'cache-control': 'no-store' },
    });
  });
});
