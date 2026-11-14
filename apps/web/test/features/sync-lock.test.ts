import { describe, expect, it, vi } from 'vitest';
import * as financeDelivery from '../../src/sync/finance-delivery.js';
import {
  drainOutbox,
  drainSequentially,
  pullChanges,
  runWithSyncLock,
} from '../../src/sync/sync-engine.js';

import {
  FinanceAccessController,
  type FinanceOfflineState,
} from '../../src/features/finance/security/finance-access-controller.js';
import {
  installFinanceAccess,
  clearFinanceAccess,
} from '../../src/features/finance/security/finance-access.js';
const persistence = vi.hoisted(() => ({
  commit: vi.fn(),
  enhanced: vi.fn(),
  backlog: vi.fn(),
  decrypt: vi.fn(),
  acknowledge: vi.fn(),
  pending: [] as unknown[],
  conflicts: new Set<string>(),
}));
vi.mock('../../src/db/client-id.js', () => ({ getClientId: async () => 'device-test' }));
vi.mock('../../src/db/list-repository.js', async (original) => ({
  ...(await original<object>()),
  listLocalLists: async () => [],
}));
vi.mock('../../src/sync/conflict-review.js', async (original) => ({
  ...(await original<object>()),
  listReviewConflicts: async () => [],
}));
vi.mock('../../src/db/task-repository.js', async (original) => ({
  ...(await original<object>()),
  decryptMutation: persistence.decrypt,
  readLocalTaskSnapshot: async () => ({ tasks: [], unreadable: [] }),
}));
vi.mock('../../src/db/finance-repository.js', async (original) => ({
  ...(await original<object>()),
  commitFinanceReplayOutcome: persistence.acknowledge,
}));
vi.mock('../../src/db/sync-cursor.js', () => ({ readCursor: async () => ({ owner: 1 }) }));
vi.mock('../../src/db/database.js', () => ({
  db: {
    settings: {
      get: async (key: string) => ({
        value: key === 'task-snapshot-bootstrapped' ? 'true' : new Date().toISOString(),
      }),
    },
    secureTaskTimers: { toArray: async () => [] },
    secureConflicts: {
      get: async (id: string) => (persistence.conflicts.has(id) ? { id } : undefined),
    },
    outbox: {
      get: async (id: string) =>
        persistence.pending.find((item) => (item as { id?: string }).id === id),
      filter: () => ({ count: async () => persistence.pending.length }),
      orderBy: () => ({
        toArray: async () => persistence.pending,
        filter: (predicate: (item: unknown) => boolean) => ({
          first: async () => persistence.pending.find(predicate),
        }),
      }),
    },
  },
}));
vi.mock('../../src/db/outbox.js', async (original) => ({
  ...(await original<object>()),
  durableBacklogSnapshot: persistence.backlog,
  commitPull: persistence.commit,
  commitEnhancedPull: persistence.enhanced,
}));

describe('desktop synchronization lock', () => {
  it('requests a backed-off retry when a task download fails with an empty outbox', async () => {
    const networkError = new TypeError('Failed to fetch');
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(networkError);
    const retry = vi.fn();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', fetcher);
    try {
      await expect(drainSequentially('csrf', retry, 3)).rejects.toBe(networkError);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/v1/sync/pull', expect.anything());
      expect(retry).toHaveBeenCalledTimes(1);
      const [[delay]] = retry.mock.calls;
      expect(delay).toBeGreaterThanOrEqual(2_000);
      expect(delay).toBeLessThanOrEqual(4_000);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps an outbox replay on its original visit while preparing the request', async () => {
    let security: FinanceOfflineState | undefined;
    const controller = new FinanceAccessController({
      ownerId: 'u1',
      store: {
        read: async () => security,
        update: async (_owner, change) => (security = change(security)),
        remove: async () => {
          security = undefined;
        },
      },
      derive: async () => 'a'.repeat(64),
      unlock: async () => ({
        grant: 'g'.repeat(43),
        securityRevision: 1,
        sessionEpoch: 1,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
      }),
    });
    await controller.synchronize({ requirePin: true, revision: 1, sessionEpoch: 1 });
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    persistence.pending = [
      {
        id: 'pending',
        entityId: 'budget',
        entityType: 'financeBudget',
        createdAt: '2026-11-07T00:00:00Z',
        payload: { iv: 'iv', ciphertext: 'encrypted' },
      },
    ];
    persistence.decrypt.mockResolvedValue({
      id: 'pending',
      entityId: 'budget',
      entityType: 'financeBudget',
      operation: 'update',
      baseVersion: 1,
      payload: { name: 'private' },
      createdAt: '2026-11-07T00:00:00Z',
      attempts: 0,
    });
    persistence.backlog.mockImplementationOnce(async () => {
      controller.lock(false);
      await controller.unlockOnline('001234');
      return { depth: 1, oldestAgeSeconds: 0 };
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ results: [{ mutationId: 'pending', status: 'applied' }] }),
      );
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', fetcher);
    try {
      await expect(drainOutbox('csrf')).rejects.toThrow(/unlock/i);
      expect(fetcher).not.toHaveBeenCalled();
      expect(persistence.acknowledge).not.toHaveBeenCalled();
      expect(persistence.pending).toHaveLength(1);
    } finally {
      persistence.pending = [];
      clearFinanceAccess();
      vi.unstubAllGlobals();
    }
  });
  it('retains queued CSV chunks without decrypting or sending them during ordinary replay', async () => {
    const controller = new FinanceAccessController({
      ownerId: 'u1',
      store: {
        read: async () => undefined,
        update: async (_owner, change) => change(undefined),
        remove: async () => undefined,
      },
      derive: async () => 'a'.repeat(64),
      unlock: vi.fn(),
    });
    await controller.synchronize({ requirePin: false, revision: 1, sessionEpoch: 1 });
    installFinanceAccess(controller);
    const pending = {
      id: 'pending-csv',
      entityId: 'batch:0',
      entityType: 'financeTransaction',
      operation: 'commitCsvChunk',
      createdAt: '2026-11-10T00:00:00Z',
      payload: { iv: 'iv', ciphertext: 'encrypted' },
    };
    persistence.pending = [pending];
    persistence.decrypt.mockClear();
    persistence.acknowledge.mockClear();
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', fetcher);
    try {
      await expect(drainOutbox('csrf')).resolves.toBeUndefined();
      expect(persistence.decrypt).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      expect(persistence.acknowledge).not.toHaveBeenCalled();
      expect(persistence.pending).toEqual([pending]);
    } finally {
      persistence.pending = [];
      clearFinanceAccess();
      vi.unstubAllGlobals();
    }
  });
  it('keeps queued Finance intent until the server acknowledges that command and its version', async () => {
    const controller = new FinanceAccessController({
      ownerId: 'u1',
      store: {
        read: async () => undefined,
        update: async (_owner, change) => change(undefined),
        remove: async () => undefined,
      },
      unlock: vi.fn(),
    });
    await controller.synchronize({ requirePin: false, revision: 1, sessionEpoch: 1 });
    installFinanceAccess(controller);
    const pending = {
      id: 'pending-budget',
      entityId: 'budget',
      entityType: 'financeBudget',
      operation: 'update',
      baseVersion: 1,
      createdAt: '2026-11-07T00:00:00Z',
      payload: { iv: 'iv', ciphertext: 'encrypted' },
      attempts: 0,
    };
    persistence.pending = [pending];
    persistence.decrypt.mockResolvedValue({ ...pending, payload: { name: 'Private edit' } });
    persistence.acknowledge.mockClear();
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', fetcher);
    try {
      for (const results of [
        [{ mutationId: 'different', status: 'applied', version: 2 }],
        [{ mutationId: 'different', status: 'conflict' }],
        [{ mutationId: pending.id, status: 'alreadyApplied', version: 1 }],
      ]) {
        fetcher.mockResolvedValueOnce(Response.json({ results }));
        await expect(drainOutbox('csrf')).rejects.toThrow(/remains saved/);
        expect(persistence.acknowledge).not.toHaveBeenCalled();
      }
      fetcher.mockResolvedValueOnce(
        Response.json({
          results: [{ mutationId: pending.id, status: 'alreadyApplied', version: 2 }],
        }),
      );
      await drainOutbox('csrf');
      expect(persistence.acknowledge).toHaveBeenCalledExactlyOnceWith({
        expected: pending,
        signal: expect.any(AbortSignal),
      });
    } finally {
      persistence.pending = [];
      clearFinanceAccess();
      vi.unstubAllGlobals();
    }
  });
  it('withholds a dependent Finance link while its parent command or conflict remains', async () => {
    const controller = new FinanceAccessController({
      ownerId: 'u1',
      store: {
        read: async () => undefined,
        update: async (_owner, change) => change(undefined),
        remove: async () => undefined,
      },
      unlock: vi.fn(),
    });
    await controller.synchronize({ requirePin: false, revision: 1, sessionEpoch: 1 });
    installFinanceAccess(controller);
    const parent = {
      id: 'budget-create',
      entityId: 'budget',
      entityType: 'financeBudget',
      operation: 'create',
      baseVersion: 0,
      createdAt: '2026-11-12T00:00:00.000Z',
      payload: { iv: 'iv', ciphertext: 'encrypted' },
      attempts: 0,
    };
    const child = {
      ...parent,
      id: 'link-create',
      entityId: 'link',
      entityType: 'financeBudgetAccountLink',
      createdAt: '2026-11-12T00:00:00.001Z',
      financeDependencyId: parent.id,
    };
    persistence.pending = [parent, child];
    persistence.decrypt.mockClear();
    persistence.acknowledge.mockClear();
    persistence.conflicts.add(parent.id);
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal('fetch', fetcher);
    try {
      // The synthetic parent conflict represents an already-reviewed parent; only the child matters.
      persistence.pending = [child];
      await expect(drainOutbox('csrf')).resolves.toBeUndefined();
      expect(persistence.decrypt).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
      persistence.conflicts.clear();
      const reviewedParent = {
        ...parent,
        entityId: 'batch:0',
        entityType: 'financeTransaction',
        operation: 'commitCsvChunk',
      };
      persistence.pending = [reviewedParent, child];
      await expect(drainOutbox('csrf')).resolves.toBeUndefined();
      expect(persistence.decrypt).not.toHaveBeenCalled();
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      persistence.pending = [];
      persistence.conflicts.clear();
      clearFinanceAccess();
      vi.unstubAllGlobals();
    }
  });
  it('withholds Finance including unexpected tombstones while committing ordinary task progress', async () => {
    vi.stubGlobal('navigator', { onLine: true });
    const request = vi.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        changes: [
          { entityType: 'financeTransaction', entityId: 'private-deleted', operation: 'tombstone' },
          { entityType: 'task', entityId: 'task-deleted', operation: 'tombstone' },
          {
            entityType: 'financeTransaction',
            entityId: 'private-new',
            operation: 'upsert',
            payload: { amountMinor: 123 },
          },
        ],
        cursor: { owner: 4 },
      }),
    } as Response);
    vi.stubGlobal('fetch', request);
    try {
      expect(await pullChanges()).toBe(true);
      expect(JSON.parse(request.mock.calls[0]![1]!.body as string)).toEqual({
        contractVersion: 8,
        cursor: { owner: 1 },
        deliverFinance: false,
      });
      expect(persistence.enhanced).not.toHaveBeenCalled();
      expect(persistence.commit).toHaveBeenCalledWith([], ['task-deleted'], [], { owner: 4 }, []);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('invalidates Finance after committing a group revocation even without task tombstones', async () => {
    const invalidate = vi
      .spyOn(financeDelivery, 'invalidateFinanceForAccessRevocation')
      .mockResolvedValue();
    persistence.enhanced.mockClear();
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          changes: [{ entityType: 'accessControl', entityId: 'group-one', operation: 'tombstone' }],
          cursor: { owner: 1, access: 2 },
        }),
      ),
    );
    try {
      expect(await pullChanges()).toBe(true);
      expect(persistence.enhanced).toHaveBeenCalledWith(
        [{ entityType: 'accessControl', entityId: 'group-one', operation: 'tombstone' }],
        [],
        { owner: 1, access: 2 },
        [{ groupId: 'group-one', listIds: [] }],
      );
      expect(invalidate).toHaveBeenCalledOnce();
      expect(persistence.enhanced).toHaveBeenCalledBefore(invalidate);
    } finally {
      invalidate.mockRestore();
      vi.unstubAllGlobals();
    }
  });
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
