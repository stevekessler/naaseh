import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/shared/security.js', () => ({ requireMutationSecurity: vi.fn() }));
const { handler } = await import('../../src/sync/handler.js');

const invoke = async (headers: Record<string, string>, signedIn = true) =>
  (await handler(
    {
      rawPath: '/api/v1/sync/push',
      headers: { origin: 'https://gsd.thepandas.link', 'x-csrf-token': 'csrf', ...headers },
      body: JSON.stringify({ contractVersion: 4, mutations: [] }),
      requestContext: {
        requestId: 'native-sync-test',
        http: { method: 'POST' },
        ...(signedIn
          ? { authorizer: { lambda: { userId: 'user', role: 'user', csrfToken: 'csrf' } } }
          : {}),
      },
    } as never,
    {} as never,
    vi.fn(),
  )) as { statusCode: number; body?: string };

describe('native sync request interoperability', () => {
  it('keeps the browser request behavior unchanged', async () => {
    const result = await invoke({});
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body ?? '{}')).toEqual({ results: [] });
  });

  it('accepts the bounded native identity headers on the existing sync route', async () => {
    const result = await invoke({
      'x-naaseh-client-platform': 'ipados',
      'x-naaseh-client-build': '25',
      'x-naaseh-contract-version': '4',
    });
    expect(result.statusCode).toBe(200);
  });

  it('never lets native headers replace session authorization', async () => {
    const result = await invoke(
      {
        'x-naaseh-client-platform': 'ios',
        'x-naaseh-client-build': '25',
        'x-naaseh-contract-version': '4',
      },
      false,
    );
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body ?? '{}').code).toBe('unauthorized');
  });
});
