import { describe, expect, it, vi } from 'vitest';
import { runWithSyncLock } from '../../src/sync/sync-engine.js';

describe('desktop synchronization lock', () => {
  it('waits for the browser lock and always runs the queued sync attempt', async () => {
    const action = vi.fn(async () => undefined);
    const request = vi.fn(
      async (_name: string, _options: LockOptions, callback: () => Promise<void>) => callback(),
    );

    await runWithSyncLock(action, { request } as unknown as Pick<LockManager, 'request'>);

    expect(request).toHaveBeenCalledWith(
      'naaseh-sync',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
      action,
    );
    expect(action).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]).toHaveLength(3);
  });

  it('still syncs when another tab leaves the browser lock stuck', async () => {
    vi.useFakeTimers();
    const action = vi.fn(async () => undefined);
    const request = vi.fn(
      async (_name: string, options: LockOptions, callback: () => Promise<void>) =>
        new Promise<void>((_resolve, reject) => {
          void callback;
          options.signal?.addEventListener('abort', () =>
            reject(new DOMException('', 'AbortError')),
          );
        }),
    );

    const result = runWithSyncLock(
      action,
      { request } as unknown as Pick<LockManager, 'request'>,
      10,
    );
    await vi.advanceTimersByTimeAsync(10);
    await result;

    expect(action).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('runs immediately when the Web Locks API is unavailable', async () => {
    const action = vi.fn(async () => undefined);

    await runWithSyncLock(action, null);

    expect(action).toHaveBeenCalledOnce();
  });
});
