import { describe, expect, it, vi } from 'vitest';
import { GoogleProviderError, GoogleTasksClient } from '../../src/google-sync/google-client.js';

const response = (body: unknown, status = 200) =>
  new Response(status === 204 ? undefined : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('Google Tasks REST transport', () => {
  it('requests completed, hidden and deleted records with bounded pages', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [{ id: 'a', title: 'A' }], nextPageToken: 'next' }))
      .mockResolvedValueOnce(response({ items: [{ id: 'b', title: 'B' }] }));
    const client = new GoogleTasksClient('access', { fetch: fetcher });
    const first = await client.listTasks('list', { updatedMin: '2026-07-25T00:00:00.000Z' });
    const second = await client.listTasks('list', { pageToken: first.nextPageToken });
    expect([...first.items, ...second.items].map((item) => item.id)).toEqual(['a', 'b']);
    const url = String(fetcher.mock.calls[0]?.[0]);
    expect(url).toContain('showCompleted=true');
    expect(url).toContain('showHidden=true');
    expect(url).toContain('showDeleted=true');
    expect(url).toContain('maxResults=100');
  });

  it('writes only date information and a content-free marker', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      response({
        id: 'remote',
        title: 'Task',
        due: '2026-07-25T00:00:00.000Z',
        notes: 'naaseh:01J00000000000000000000992',
      }),
    );
    const client = new GoogleTasksClient('access', { fetch: fetcher });
    await client.createTask('list', {
      title: 'Task',
      dueDate: '2026-07-25',
      notes: 'naaseh:01J00000000000000000000992',
    });
    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(init.body))).toEqual({
      title: 'Task',
      due: '2026-07-25T00:00:00.000Z',
      status: 'needsAction',
      notes: 'naaseh:01J00000000000000000000992',
    });
  });

  it('rejects malformed provider data and classifies revoked access safely', async () => {
    const malformed = new GoogleTasksClient('access', {
      fetch: vi.fn().mockResolvedValue(response({ items: [{ id: 4 }] })),
    });
    await expect(malformed.listTasks('list')).rejects.toMatchObject({ name: 'ZodError' });
    const revoked = new GoogleTasksClient('access', {
      fetch: vi.fn().mockResolvedValue(response({}, 401)),
      maxReadAttempts: 1,
    });
    await expect(revoked.listTasks('list')).rejects.toEqual(
      expect.objectContaining<Partial<GoogleProviderError>>({
        safeCode: 'google_reauthorization_required',
        status: 401,
        retryable: false,
      }),
    );
  });

  it('does not blindly retry an insert with an unknown outcome', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('timeout'));
    const client = new GoogleTasksClient('access', { fetch: fetcher, timeoutMs: 5 });
    await expect(
      client.createTask('list', { title: 'Task', dueDate: '2026-07-25' }),
    ).rejects.toMatchObject({
      safeCode: 'google_network_failure',
      unknownOutcome: true,
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
