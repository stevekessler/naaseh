import { describe, expect, it, vi } from 'vitest';
import { dispatchFinanceInvocation } from '../../apps/api/src/finance/query-worker.js';

describe('Finance HTTP and IAM invocation boundary', () => {
  it('routes an HTTP body imitating a worker envelope through normal HTTP authorization', async () => {
    const http = vi.fn(async () => ({ statusCode: 403, body: '{}' }));
    const worker = vi.fn(async () => undefined);
    const event = {
      version: '2.0',
      requestContext: { http: { method: 'POST' } },
      headers: {},
      body: JSON.stringify({
        kind: 'naaseh.finance.query-worker',
        userId: 'other-user',
        queryId: '01K00000000000000000000001',
      }),
    };
    expect(await dispatchFinanceInvocation(event, { http, worker })).toMatchObject({
      statusCode: 403,
    });
    expect(http).toHaveBeenCalledWith(event);
    expect(worker).not.toHaveBeenCalled();
  });

  it('accepts only the minimal IAM-invoked worker envelope and rejects user-controlled bypass fields', async () => {
    const http = vi.fn(async () => ({ statusCode: 200, body: '{}' }));
    const worker = vi.fn(async () => undefined);
    const envelope = {
      kind: 'naaseh.finance.query-worker',
      userId: 'u1',
      queryId: '01K00000000000000000000001',
    };
    await dispatchFinanceInvocation(envelope, { http, worker });
    expect(worker).toHaveBeenCalledWith({ userId: 'u1', queryId: envelope.queryId });
    expect(http).not.toHaveBeenCalled();
    await expect(
      dispatchFinanceInvocation(
        { ...envelope, unlocked: true, payload: 'private' },
        { http, worker },
      ),
    ).rejects.toThrow(/invalid/i);
  });
});
