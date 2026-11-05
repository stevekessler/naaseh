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
  const runtime = vi.fn(
    (_options: Parameters<NonNullable<Parameters<typeof createFinanceHandler>[2]>>[0]) => {
      void _options;
      return { status };
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
  return { hydrate, authorize, status, runtime, event, handler };
}
afterEach(() => vi.restoreAllMocks());

describe('bounded Finance query status HTTP delivery', () => {
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
