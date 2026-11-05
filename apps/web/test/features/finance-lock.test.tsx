import { readEncryptedBudgetProjection } from '../../src/db/finance-repository.js';
import { parseProtectedFinanceCsv } from '../../src/features/finance/csv/csv-worker-client.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FinanceAccessController,
  type FinanceOfflineState,
} from '../../src/features/finance/security/finance-access-controller.js';

import {
  installFinanceAccess,
  clearFinanceAccess,
} from '../../src/features/finance/security/finance-access.js';
import { financeRequest } from '../../src/features/finance/finance-client.js';
import { readFinanceReplayIntent } from '../../src/sync/finance-sync.js';
import {
  readOrdinaryConflict,
  ordinaryConflictVisible,
} from '../../src/sync/finance-conflict-access.js';

const controllers: FinanceAccessController[] = [];
afterEach(() => {
  clearFinanceAccess();
  for (const controller of controllers.splice(0)) controller.dispose();
});
function setup() {
  let now = Date.parse('2026-11-01T18:00:00Z');
  let state: FinanceOfflineState | undefined;
  const listeners = new Set<(securityChanged?: boolean) => void>();
  const pending = {
    transaction: 'retained-encrypted-edit',
    bytes: 'retained-encrypted-receipt',
    deviceKey: 'retained-device-key',
  };
  const store = {
    read: async () => structuredClone(state),
    update: async (
      _owner: string,
      change: (current: FinanceOfflineState | undefined) => FinanceOfflineState,
    ) => {
      state = structuredClone(change(structuredClone(state)));
      return structuredClone(state);
    },
    remove: async () => {
      state = undefined;
    },
  };
  const derive = async (pin: string, salt: string) => {
    const data = new TextEncoder().encode(`${salt}:${pin}`);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  };
  const options = {
    ownerId: 'u1',
    store,
    now: () => now,
    derive,
    unlock: async () => ({
      grant: 'g'.repeat(43),
      expiresAt: new Date(now + 30 * 60_000).toISOString(),
      securityRevision: 1,
      sessionEpoch: 1,
    }),
    notifyLock: (securityChanged?: boolean) => {
      for (const listener of listeners) listener(securityChanged);
    },
    subscribeLock: (callback: (securityChanged?: boolean) => void) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
  const create = (extra = {}) => {
    const value = new FinanceAccessController({ ...options, ...extra });
    controllers.push(value);
    return value;
  };
  return {
    create,
    store,
    pending,
    options,
    now: () => now,
    advance: (milliseconds: number) => {
      now += milliseconds;
    },
    state: () => state,
  };
}
const preference = { requirePin: true, revision: 1, sessionEpoch: 1 };

describe('Finance visit and offline access controller', () => {
  it('never decrypts known Finance conflicts in ordinary review while ordinary records remain usable', async () => {
    const decrypt = vi.fn(async () => ({ mutation: { entityType: 'task' }, label: 'ordinary' }));
    expect(await readOrdinaryConflict({ entityType: 'financeBudget' }, decrypt)).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    expect(await readOrdinaryConflict({ entityType: 'financeBudget' }, decrypt)).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
    expect(ordinaryConflictVisible({ entityType: 'financeBudget' })).toBe(false);
    expect(ordinaryConflictVisible({})).toBe(false);
    expect(ordinaryConflictVisible({ entityType: 'task' })).toBe(true);
    expect(await readOrdinaryConflict({ entityType: 'task' }, decrypt)).toMatchObject({
      label: 'ordinary',
    });
  });
  it('holds unknown legacy conflicts until authorized classification and excludes Finance from ordinary review', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    installFinanceAccess(controller);
    const decrypt = vi.fn(async () => ({
      mutation: { entityType: 'financeBudget' },
      private: 'protected',
    }));
    const classify = vi.fn(async () => undefined);
    expect(await readOrdinaryConflict({}, decrypt, classify)).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
    await controller.unlockOnline('001234');
    expect(await readOrdinaryConflict({}, decrypt, classify)).toBeUndefined();
    expect(classify).toHaveBeenCalledWith('financeBudget');
    expect(
      await readOrdinaryConflict({}, async () => ({ mutation: { entityType: 'task' } }), classify),
    ).toMatchObject({ mutation: { entityType: 'task' } });
    expect(classify).toHaveBeenCalledWith('task');
    expect(await readOrdinaryConflict({}, async () => ({}), classify)).toBeUndefined();
  });
  it('withholds a legacy conflict resolved after lock before classifying or returning its plaintext', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    let finish!: (value: { mutation: { entityType: string } }) => void;
    const classify = vi.fn(async () => undefined);
    const value = readOrdinaryConflict(
      {},
      () =>
        new Promise<{ mutation: { entityType: string } }>((resolve) => {
          finish = resolve;
        }),
      classify,
    );
    controller.lock();
    finish({ mutation: { entityType: 'financeTransaction' } });
    expect(await value).toBeUndefined();
    expect(classify).not.toHaveBeenCalled();
  });
  it('holds unknown, locked and offline-only Finance intent without blocking ordinary task decryption', async () => {
    const decrypt = vi.fn(async () => ({ private: 'queued-intent' }));
    expect(await readFinanceReplayIntent('financeBudget', decrypt)).toBeUndefined();
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    installFinanceAccess(controller);
    expect(await readFinanceReplayIntent('financeBudget', decrypt)).toBeUndefined();
    expect(decrypt).not.toHaveBeenCalled();
    await controller.unlockOnline('001234');
    expect(await readFinanceReplayIntent('financeBudget', decrypt)).toEqual({
      private: 'queued-intent',
    });
    controller.lock();
    await controller.unlockOffline('001234');
    expect(await readFinanceReplayIntent('financeBudget', decrypt)).toBeUndefined();
    expect(decrypt).toHaveBeenCalledOnce();
    expect(await readFinanceReplayIntent('task', decrypt)).toEqual({ private: 'queued-intent' });
    expect(decrypt).toHaveBeenCalledTimes(2);
  });
  it('withholds queued Finance plaintext when lock occurs during decryption and retains the encrypted intent', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    let finish!: (value: string) => void;
    const intent = readFinanceReplayIntent(
      'financeTransaction',
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );
    controller.lock();
    finish('late-plaintext');
    expect(await intent).toBeUndefined();
    expect(f.pending.transaction).toBe('retained-encrypted-edit');
  });
  it('does not start a CSV worker when file reading completes after lock', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    let finish!: (value: string) => void;
    const factory = vi.fn();
    const promise = parseProtectedFinanceCsv(
      {
        text: () =>
          new Promise<string>((resolve) => {
            finish = resolve;
          }),
      },
      { worker: factory },
    );
    const rejected = expect(promise).rejects.toThrow(/unlock/i);
    controller.lock();
    finish('sensitive,csv');
    await rejected;
    expect(factory).not.toHaveBeenCalled();
  });
  it('terminates a CSV worker and withholds late progress/rows on lock', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    const worker = {
      onmessage: undefined as ((event: MessageEvent) => void) | undefined,
      onerror: undefined,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    const progress = vi.fn();
    const promise = parseProtectedFinanceCsv(
      { text: async () => 'sensitive,csv' },
      { worker: () => worker as unknown as Worker, onProgress: progress },
    );
    const rejected = expect(promise).rejects.toThrow(/unlock/i);
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    controller.lock();
    worker.onmessage?.({ data: { type: 'progress', rowsParsed: 100 } } as MessageEvent);
    worker.onmessage?.({
      data: { type: 'complete', rows: [['sensitive', 'csv']] },
    } as MessageEvent);
    await rejected;
    expect(worker.terminate).toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  });
  it('releases successful CSV workers and honors explicit parse cancellation', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    const worker = {
      onmessage: undefined as ((event: MessageEvent) => void) | undefined,
      onerror: undefined,
      postMessage: vi.fn(),
      terminate: vi.fn(),
    };
    const promise = parseProtectedFinanceCsv(
      { text: async () => 'date,description' },
      { worker: () => worker as unknown as Worker },
    );
    await vi.waitFor(() => expect(worker.postMessage).toHaveBeenCalled());
    worker.onmessage?.({
      data: { type: 'complete', rows: [['date', 'description']] },
    } as MessageEvent);
    await expect(promise).resolves.toEqual([['date', 'description']]);
    expect(worker.terminate).toHaveBeenCalled();
    const signal = new AbortController();
    signal.abort();
    const factory = vi.fn();
    await expect(
      parseProtectedFinanceCsv(
        { text: async () => 'private' },
        { signal: signal.signal, worker: factory },
      ),
    ).rejects.toThrow(/unlock/i);
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not issue Finance requests before a trusted access controller is available', async () => {
    let calls = 0;
    await expect(
      financeRequest('/finance/accounts', {}, async () => {
        calls++;
        return Response.json({ items: [] });
      }),
    ).rejects.toThrow(/unlock/i);
    expect(calls).toBe(0);
  });
  it('binds requests to the current tab and withholds responses completed after lock', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    let signal: AbortSignal | undefined;
    const request = financeRequest('/finance/accounts', {}, async (_url, init) => {
      expect(new Headers(init?.headers).get('x-finance-unlock')).toBe('g'.repeat(43));
      expect(new Headers(init?.headers).get('x-finance-tab')).toBe(controller.tabNonce);
      signal = init?.signal ?? undefined;
      controller.lock();
      return Response.json({ secret: 'late-protected-row' });
    });
    await expect(request).rejects.toThrow(/unlock/i);
    expect(signal?.aborted).toBe(true);
  });
  it('clears a prior controller when switching users and rejects late local decryption', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    installFinanceAccess(controller);
    await expect(
      controller.read(async () => {
        clearFinanceAccess();
        return 'late-plaintext';
      }),
    ).rejects.toThrow(/unlock/i);
    expect(controller.canRead()).toBe(false);
    expect(() => controller.requestHeaders()).toThrow(/unlock/i);
  });

  it('fails closed for unknown preferences and missing offline verification material', async () => {
    const f = setup();
    const controller = f.create();
    expect(controller.canRead()).toBe(false);
    await expect(readEncryptedBudgetProjection('hidden-budget', {} as CryptoKey)).rejects.toThrow(
      /unlock/i,
    );
    await expect(controller.unlockOffline('001234')).rejects.toThrow(/connect/i);
    await controller.synchronize(preference);
    await expect(controller.unlockOffline('001234')).rejects.toThrow(/connect/i);
  });
  it('keeps online grants in memory and persists neither the token nor the PIN', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    expect(controller.requestHeaders()).toMatchObject({ 'x-finance-unlock': 'g'.repeat(43) });
    expect(controller.canRead()).toBe(true);
    expect(JSON.stringify(f.state())).not.toContain('001234');
    expect(JSON.stringify(f.state())).not.toContain('g'.repeat(43));
  });
  it('restores locked, then unlocks only local data without minting an online grant', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    controller.lock();
    const restored = f.create();
    await restored.restore();
    expect(restored.canRead()).toBe(false);
    await restored.unlockOffline('001234');
    expect(restored.canRead()).toBe(true);
    expect(restored.requestHeaders()).not.toHaveProperty('x-finance-unlock');
  });
  it('persists the fifth-failure delay across controller instances', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    controller.lock();
    for (let i = 0; i < 5; i++) await expect(controller.unlockOffline('999999')).rejects.toThrow();
    expect(f.state()?.retryAt).toBe(f.now() + 30_000);
    const restored = f.create();
    await restored.restore();
    await expect(restored.unlockOffline('001234')).rejects.toThrow(/wait/i);
    f.advance(30_000);
    await restored.unlockOffline('001234');
    expect(restored.canRead()).toBe(true);
  });
  it('locks other tabs without allowing a new tab to inherit a visit grant', async () => {
    const f = setup();
    const a = f.create();
    const b = f.create();
    await a.synchronize({ requirePin: false, revision: 0, sessionEpoch: 1 });
    await b.restore();
    expect(b.canRead()).toBe(true);
    await a.synchronize(preference);
    expect(b.canRead()).toBe(false);
    await a.unlockOnline('001234');
    await b.restore();
    expect(b.canRead()).toBe(false);
    b.lock();
    expect(a.canRead()).toBe(false);
  });
  it('replaces only offline verification metadata on a security revision change', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    await controller.synchronize({ ...preference, revision: 2 });
    expect(controller.canRead()).toBe(false);
    await expect(controller.unlockOffline('001234')).rejects.toThrow(/connect/i);
    // A delayed pre-reset response must not roll back durable security metadata.
    await expect(controller.synchronize(preference)).rejects.toThrow(/connect/i);
    expect(f.state()?.revision).toBe(2);
    expect(controller.canRead()).toBe(false);
    expect(f.pending).toEqual({
      transaction: 'retained-encrypted-edit',
      bytes: 'retained-encrypted-receipt',
      deviceKey: 'retained-device-key',
    });
  });
  it('clears grants and plaintext cleanup callbacks when the canonical epoch changes', async () => {
    const f = setup();
    const controller = f.create();
    let purges = 0;
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    controller.onLock(() => {
      purges++;
    });
    await controller.synchronize({ ...preference, sessionEpoch: 2 });
    expect(controller.canRead()).toBe(false);
    expect(purges).toBeGreaterThan(0);
    expect(() => controller.requestHeaders()).toThrow(/unlock/i);
  });
  it('rejects late worker results after a lock without reviving the old visit', async () => {
    const f = setup();
    let finish!: (hash: string) => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const controller = f.create({
      derive: async () => {
        entered();
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    });
    await controller.synchronize(preference);
    const pending = controller.unlockOnline('001234');
    const rejected = expect(pending).rejects.toThrow();
    await started;
    controller.lock();
    finish('0'.repeat(64));
    await rejected;
    expect(controller.canRead()).toBe(false);
  });
  it('expires visits and relocks on unrelated navigation or restored page lifecycle', async () => {
    const f = setup();
    const controller = f.create();
    await controller.synchronize(preference);
    await controller.unlockOnline('001234');
    controller.visitFinance(true);
    expect(controller.canRead()).toBe(true);
    f.advance(30 * 60_000);
    expect(controller.canRead()).toBe(false);
    await controller.unlockOnline('001234');
    controller.visitFinance(false);
    expect(controller.canRead()).toBe(false);
    await controller.unlockOnline('001234');
    const target = new EventTarget();
    const unbind = controller.bindLifecycle(target);
    target.dispatchEvent(new Event('pageshow'));
    expect(controller.canRead()).toBe(false);
    unbind();
  });
});
