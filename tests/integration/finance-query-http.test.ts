import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import { DynamoFinanceRepository } from '../../apps/api/src/finance/dynamo-repository.js';
import { SafeApiError } from '../../apps/api/src/shared/http.js';
import { FinanceExperienceFailure } from '../../apps/api/src/finance/telemetry.js';
import type { FinanceReadResult } from '../../apps/api/src/finance/query-contract.js';
import type { FinanceQueryJob } from '../../apps/api/src/finance/query-job-service.js';

const id = '01K7Q0Y0000000000000000001';
function fixture() {
  const hydrate = vi
    .spyOn(DynamoFinanceRepository, 'forActor')
    .mockRejectedValue(new Error('Unbounded hydration forbidden.'));
  const authorize = vi.fn(async () => ({ requirePin: true, securityRevision: 4, sessionEpoch: 2 }));
  const status = vi
    .fn<(userId: string, queryId: string) => Promise<FinanceReadResult>>()
    .mockResolvedValue({
      items: [],
      asOf: '2026-11-03T00:00:00.000Z',
      projectionRevision: 'opaque',
      complete: false,
      rowsState: 'searching' as const,
      aggregateState: 'pending' as const,
      coverage: { examined: 0, scopeComplete: false },
      queryId: id,
    });
  const start = vi.fn(async () => id);
  const page = vi
    .fn<(userId: string, queryId: string, request: unknown) => Promise<FinanceReadResult>>()
    .mockResolvedValue({
      items: [],
      asOf: '2026-11-03T00:00:00.000Z',
      projectionRevision: 'opaque',
      complete: true,
      rowsState: 'confirmed-empty',
      aggregateState: 'exact',
      coverage: { examined: 0, scopeComplete: true },
      totalCount: 0,
      totalsByCurrency: [],
      queryId: id,
    });
  const runtime = vi.fn(
    (_options: Parameters<NonNullable<Parameters<typeof createFinanceHandler>[2]>>[0]) => {
      void _options;
      return { status, start, page };
    },
  );
  const event = {
    version: '2.0',
    rawPath: `/api/v1/finance/queries/${id}`,
    headers: {
      'x-finance-unlock': 'tab-grant',
      'x-finance-tab': 'tab-nonce',
    },
    queryStringParameters: { userId: 'other-owner' },
    requestContext: {
      requestId: 'query-http',
      http: { method: 'GET' },
      authorizer: { lambda: { userId: 'owner', sessionHash: 'session-hash' } },
    },
  } as unknown as APIGatewayProxyEventV2;
  const handler = createFinanceHandler(undefined, authorize, runtime);
  return { hydrate, authorize, status, start, page, runtime, event, handler };
}
function creationFixture() {
  const f = fixture();
  f.event.rawPath = '/api/v1/finance/queries';
  f.event.requestContext.http.method = 'POST';
  f.event.headers = {
    ...f.event.headers,
    origin: 'http://localhost:4173',
    'x-csrf-token': 'csrf',
    'idempotency-key': 'query-request-1',
  };
  Object.assign(f.event.requestContext.authorizer!.lambda!, { csrfToken: 'csrf' });
  f.event.body = JSON.stringify({ accountIds: [id], filters: { text: 'Synthetic' } });
  return f;
}
afterEach(() => vi.restoreAllMocks());

describe('bounded Finance query status HTTP delivery', () => {
  it('serves owner-bound row pages and pending continuation responses without scope hydration', async () => {
    const f = fixture();
    f.event.rawPath += '/rows';
    f.event.queryStringParameters = {
      limit: '25',
      cursor: 'encrypted-page',
      userId: 'another-owner',
    };
    expect((await f.handler(f.event)).statusCode).toBe(200);
    expect(f.page).toHaveBeenCalledWith('owner', id, { limit: 25, cursor: 'encrypted-page' });
    f.page.mockResolvedValueOnce({
      items: [],
      asOf: '2026-11-03T00:00:00.000Z',
      projectionRevision: 'opaque',
      complete: false,
      rowsState: 'searching',
      aggregateState: 'pending',
      coverage: { examined: 1000, scopeComplete: false },
      queryId: id,
    });
    const pending = await f.handler(f.event);
    expect(pending.statusCode).toBe(202);
    expect(typeof pending === 'object' && pending.headers?.['retry-after']).toBe('1');
    expect(f.hydrate).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
  });

  it('starts a filtered account query before any legacy scope hydration', async () => {
    const f = fixture();
    f.event.rawPath = '/api/v1/finance/accounts/' + id + '/transactions';
    f.event.queryStringParameters = { browse: '1' };
    f.event.rawQueryString = 'browse=1&text=Market&amount=-1250&checkNumber=000123';
    expect((await f.handler(f.event)).statusCode).toBe(200);
    expect(f.start).toHaveBeenCalledExactlyOnceWith(
      'owner',
      4,
      expect.objectContaining({
        accountIds: [id],
        filters: expect.objectContaining({ amount: -1250, checkNumber: '000123', text: 'Market' }),
      }),
    );
    expect(f.page).toHaveBeenCalledExactlyOnceWith('owner', id, { limit: 50 });
    expect(f.hydrate).not.toHaveBeenCalled();
    f.event.rawQueryString += '&accountIds%5B%5D=01K7Q0Y0000000000000000002';
    expect((await f.handler(f.event)).statusCode).toBe(400);
    expect(f.start).toHaveBeenCalledOnce();
  });

  it('rejects invalid page bounds before constructing its runtime', async () => {
    const f = fixture();
    f.event.rawPath += '/rows';
    for (const limit of ['0', '201', '1.5', 'invalid']) {
      f.event.queryStringParameters = { limit };
      expect((await f.handler(f.event)).statusCode).toBe(400);
    }
    f.event.queryStringParameters = { cursor: 'x'.repeat(4097) };
    expect((await f.handler(f.event)).statusCode).toBe(400);
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.hydrate).not.toHaveBeenCalled();
  });

  it('withholds a row page when the visit locks during its lookup', async () => {
    const f = fixture();
    f.event.rawPath += '/rows';
    f.authorize
      .mockResolvedValueOnce({ requirePin: true, securityRevision: 4, sessionEpoch: 2 })
      .mockRejectedValue(
        new SafeApiError(403, 'finance_locked', 'Unlock Finance to continue.', 'authorization'),
      );
    const response = await f.handler(f.event);
    expect(response.statusCode).toBe(403);
    expect(f.page).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain('opaque');
    expect(f.hydrate).not.toHaveBeenCalled();
  });

  it('creates a bounded job for the current owner and canonical visit without legacy hydration', async () => {
    const f = creationFixture();
    const response = await f.handler(f.event);
    expect(response.statusCode).toBe(202);
    expect(JSON.parse(typeof response === 'object' ? response.body! : '{}')).toEqual({
      queryId: id,
    });
    expect(f.start).toHaveBeenCalledExactlyOnceWith(
      'owner',
      4,
      expect.objectContaining({
        accountIds: [id],
        filters: expect.objectContaining({ text: 'Synthetic' }),
      }),
      'query-request-1',
    );
    expect(f.hydrate).not.toHaveBeenCalled();
    expect(f.status).not.toHaveBeenCalled();
    expect(typeof response === 'object' && response.headers?.['cache-control']).toBe('no-store');
  });

  it('rejects malformed or forged creation payloads before constructing a query runtime', async () => {
    const f = creationFixture();
    for (const body of [
      '{',
      JSON.stringify({ accountIds: [id], userId: 'another-owner' }),
      JSON.stringify({ accountIds: [id], sourceRevisions: { private: 'forged' } }),
      JSON.stringify({ accountIds: [id], kind: 'naaseh.finance.query-worker' }),
    ]) {
      f.event.body = body;
      expect((await f.handler(f.event)).statusCode).toBe(400);
    }
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.hydrate).not.toHaveBeenCalled();
  });

  it('requires origin, CSRF and a request identity before starting a query', async () => {
    const f = creationFixture();
    const headers = { ...f.event.headers };
    for (const [patch, expected] of [
      [{ origin: 'https://untrusted.invalid' }, 403],
      [{ 'x-csrf-token': 'wrong' }, 403],
      [{ 'idempotency-key': undefined }, 400],
    ] as const) {
      f.event.headers = { ...headers, ...patch };
      expect((await f.handler(f.event)).statusCode).toBe(expected);
    }
    expect(f.start).not.toHaveBeenCalled();
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.hydrate).not.toHaveBeenCalled();
  });

  it('withholds the new query identifier when the visit locks during creation', async () => {
    const f = creationFixture();
    f.authorize
      .mockResolvedValueOnce({ requirePin: true, securityRevision: 4, sessionEpoch: 2 })
      .mockRejectedValue(
        new SafeApiError(403, 'finance_locked', 'Unlock Finance to continue.', 'authorization'),
      );
    const response = await f.handler(f.event);
    expect(response.statusCode).toBe(403);
    expect(f.start).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain(id);
    expect(f.hydrate).not.toHaveBeenCalled();
  });

  it('uses the authenticated owner and current visit without legacy scope hydration', async () => {
    const f = fixture();
    const response = await f.handler(f.event);
    expect(response.statusCode).toBe(200);
    expect(f.status).toHaveBeenCalledWith('owner', id);
    expect(f.hydrate).not.toHaveBeenCalled();
    expect(f.authorize).toHaveBeenLastCalledWith({
      userId: 'owner',
      sessionHash: 'session-hash',
      grant: 'tab-grant',
      tabNonce: 'tab-nonce',
    });
    expect(typeof response === 'object' && response.headers?.['cache-control']).toBe('no-store');
  });
  it('rejects a locked visit before constructing the query runtime', async () => {
    const f = fixture();
    f.authorize.mockRejectedValue(
      new SafeApiError(403, 'finance_locked', 'Unlock Finance to continue.', 'authorization'),
    );
    expect((await f.handler(f.event)).statusCode).toBe(403);
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.hydrate).not.toHaveBeenCalled();
  });
  it('withholds a result when the visit locks during the status read', async () => {
    const f = fixture();
    f.authorize
      .mockResolvedValueOnce({ requirePin: true, securityRevision: 4, sessionEpoch: 2 })
      .mockRejectedValue(
        new SafeApiError(403, 'finance_locked', 'Unlock Finance to continue.', 'authorization'),
      );
    const response = await f.handler(f.event);
    expect(response.statusCode).toBe(403);
    expect(JSON.stringify(response)).not.toContain('opaque');
  });
  it('binds the runtime delivery check to the current owner and security revision', async () => {
    const f = fixture();
    await f.handler(f.event);
    const delivery = f.runtime.mock.calls[0]![0]!.authorizeDelivery!;
    const job = { userId: 'owner', securityRevision: 4 } as FinanceQueryJob;
    expect(await delivery(job)).toBe(true);
    expect(await delivery({ ...job, userId: 'other-owner' })).toBe(false);
    expect(await delivery({ ...job, securityRevision: 3 })).toBe(false);
  });
  it('rejects malformed query identifiers without any query or scope read', async () => {
    const f = fixture();
    f.event.rawPath = '/api/v1/finance/queries/not-a-query';
    expect((await f.handler(f.event)).statusCode).toBe(400);
    expect(f.runtime).not.toHaveBeenCalled();
    expect(f.hydrate).not.toHaveBeenCalled();
  });
  it('returns safe expired, restart and unavailable states without source details', async () => {
    const f = fixture();
    for (const [category, code, status] of [
      ['validation', 'finance_query_expired', 404],
      ['authorization', 'finance_query_restart_required', 409],
      ['storage', 'finance_query_unavailable', 503],
    ] as const) {
      f.status.mockRejectedValueOnce(
        new FinanceExperienceFailure(category, 'private-source-id and private-financial-value'),
      );
      const response = await f.handler(f.event);
      expect(response.statusCode).toBe(status);
      expect(JSON.stringify(response)).toContain(code);
      expect(JSON.stringify(response)).not.toContain('private-');
    }
    expect(f.hydrate).not.toHaveBeenCalled();
  });
});

it('routes CSV duplicate checks through the Finance gate without scope hydration', async () => {
  const f = creationFixture();
  f.event.rawPath = `/api/v1/finance/accounts/${id}/csv-duplicates`;
  const input = {
    rows: [
      {
        ordinal: 1,
        amountMinor: -100,
        transactedAt: '2026-10-01T12:00:00.000Z',
        description: 'Synthetic expense',
      },
    ],
  };
  f.event.body = JSON.stringify(input);
  const check = vi.fn(async () => ({ ordinals: [1] }));
  const handler = createFinanceHandler(undefined, f.authorize, f.runtime, check);
  const response = await handler(f.event);
  expect(response).toMatchObject({ statusCode: 200, body: '{"ordinals":[1]}' });
  expect(check).toHaveBeenCalledWith('owner', id, input);
  expect(f.authorize).toHaveBeenCalledTimes(2);
  expect(f.hydrate).not.toHaveBeenCalled();
});
