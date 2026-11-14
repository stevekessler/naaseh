import { refreshFinanceSecurity } from '../../src/features/finance/security/finance-access-session.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinanceAccessController,
  type FinanceOfflineState,
} from '../../src/features/finance/security/finance-access-controller.js';
import {
  clearFinanceAccess,
  currentFinanceAccess,
  installFinanceAccess,
} from '../../src/features/finance/security/finance-access.js';
import {
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  disposeFinanceApiSnapshot,
  combineFinanceApiSnapshots,
} from '../../src/sync/finance-api-snapshot.js';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  commit: vi.fn(),
  invalidate: vi.fn(),
  count: vi.fn(),
  generation: 'a'.repeat(36),
}));
vi.mock('../../src/db/database.js', () => ({
  db: {
    secureFinanceRecords: {
      count: mocks.count,
      toCollection: () => ({ primaryKeys: async () => ['legacy'] }),
    },
    outbox: { toArray: async () => [] },
    transaction: async (_mode: unknown, _tables: unknown, work: () => Promise<unknown>) => work(),
  },
}));
vi.mock('../../src/sync/finance-delivery.js', () => ({
  readFinanceDeliveryCheckpoint: mocks.read,
  commitFinanceDelivery: mocks.commit,
  invalidateFinanceDeliveryCache: mocks.invalidate,
}));
vi.mock('../../src/sync/finance-cache-access.js', () => ({
  maintainFinanceCache: (operation: (signal: AbortSignal) => Promise<unknown>) =>
    currentFinanceAccess().read(operation),
  readFinanceCachedData: (operation: (lease: unknown) => Promise<unknown>) =>
    currentFinanceAccess().read(() => operation({})),
  withFinanceCacheLease: (_lease: unknown, operation: (generation: string) => Promise<unknown>) =>
    operation(mocks.generation),
}));
const proof = 'fc1.nonce.previous.tag',
  firstProof = 'fc1.nonce.first.tag',
  secondProof = 'fc1.nonce.second.tag',
  mergedProof = 'fc1.nonce.merged.tag';
const previous = {
  ownerId: 'u1',
  version: 1,
  cursor: { owner: 2 },
  cacheProof: proof,
  cacheGeneration: 'a'.repeat(36),
};
let access: FinanceAccessController, fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
async function open(ownerId = 'u1') {
  let state: FinanceOfflineState | undefined;
  access = new FinanceAccessController({
    ownerId,
    store: {
      read: async () => state,
      update: async (_id, update) => (state = update(state)),
      remove: async () => {
        state = undefined;
      },
    },
    unlock: async () => {
      throw new Error('No PIN used in this fixture');
    },
  });
  await access.synchronize({ requirePin: false, revision: 1, sessionEpoch: 0 });
  installFinanceAccess(access);
}
beforeEach(async () => {
  vi.resetAllMocks();
  mocks.generation = previous.cacheGeneration;
  vi.stubGlobal('navigator', { onLine: true });
  await open();
  mocks.read.mockResolvedValue(previous);
  mocks.count.mockResolvedValue(0);
  mocks.commit.mockImplementation(async (input) => ({
    ...previous,
    cacheProof: input.cacheProof,
    version: 2,
  }));
  fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) =>
    String(url).endsWith('/sync/pull')
      ? Response.json({
          financeCache: { status: 'current', proof: mergedProof },
          financeCursor: { owner: 999 },
        })
      : Response.json(
          { items: ['private value'] },
          { headers: { 'x-finance-cache-proof': firstProof } },
        ),
  );
  vi.stubGlobal('fetch', fetcher);
});
afterEach(() => {
  clearFinanceAccess();
  vi.unstubAllGlobals();
});
describe('retained Finance API snapshot lifecycle', () => {
  it.each([401, 403, 404, 409])(
    'invalidates retained cache authority after a known source failure %s',
    async (status) => {
      mocks.invalidate.mockImplementation(async () => {
        await access.markStale();
      });
      fetcher.mockResolvedValue(
        Response.json({ code: 'finance_access_changed', title: 'Refresh Finance.' }, { status }),
      );
      await expect(
        loadFinanceApiSnapshot((request) => request('/finance/accounts')),
      ).rejects.toThrow(/refresh/i);
      expect(mocks.invalidate).toHaveBeenCalledWith('u1');
      expect(mocks.commit).not.toHaveBeenCalled();
      expect(access.canRead()).toBe(false);
    },
  );
  it('combines two proven values without persisting plaintext or requiring their old view tokens to stay alive', async () => {
    const first = await loadFinanceApiSnapshot((request) =>
      request<{ items: string[] }>('/finance/accounts'),
    );
    const second = await loadFinanceApiSnapshot((request) =>
      request<{ items: string[] }>('/finance/categories'),
    );
    const commits = mocks.commit.mock.calls.length;
    const combined = await combineFinanceApiSnapshots(first, second, (a, b) => ({
      combined: [...a.items, ...b.items],
    }));
    expect(JSON.stringify(combined)).toBe('{}');
    expect(mocks.commit).toHaveBeenCalledTimes(commits);
    disposeFinanceApiSnapshot(first);
    disposeFinanceApiSnapshot(second);
    await expect(readFinanceApiSnapshot(combined, (value) => value)).resolves.toEqual({
      combined: ['private value', 'private value'],
    });
    access.lock(false);
    await expect(readFinanceApiSnapshot(combined, (value) => value)).rejects.toThrow(
      /refresh|unlock/i,
    );
  });
  it('rejects mixed generations and ingredient disposal during a combined read', async () => {
    const first = await loadFinanceApiSnapshot((request) => request('/finance/accounts'));
    const second = await loadFinanceApiSnapshot((request) => request('/finance/categories'));
    const combine = vi.fn(async () => {
      disposeFinanceApiSnapshot(first);
      return 'must not publish';
    });
    await expect(combineFinanceApiSnapshots(first, second, combine)).rejects.toThrow(/refresh/i);
    const third = await loadFinanceApiSnapshot((request) => request('/finance/accounts'));
    mocks.commit.mockResolvedValueOnce({ ...previous, cacheGeneration: 'b'.repeat(36) });
    const fourth = await loadFinanceApiSnapshot((request) => request('/finance/accounts'));
    const mismatched = vi.fn(() => 'must not run');
    await expect(combineFinanceApiSnapshots(third, fourth, mismatched)).rejects.toThrow(/refresh/i);
    expect(mismatched).not.toHaveBeenCalled();
  });
  it('joins every GET proof with prior cache evidence and stores only an unchanged-cursor checkpoint', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/sync/pull')
        ? Response.json({
            financeCache: { status: 'current', proof: mergedProof },
            financeCursor: { owner: 999 },
          })
        : Response.json(
            { items: ['private value'] },
            {
              headers: {
                'x-finance-cache-proof': String(url).endsWith('/categories')
                  ? secondProof
                  : firstProof,
              },
            },
          ),
    );
    const snapshot = await loadFinanceApiSnapshot(async (request) =>
      Promise.all([
        request<{ items: string[] }>('/finance/accounts'),
        request<{ items: string[] }>('/finance/categories'),
      ]),
    );
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-finance-cache-protocol')).toBe(
      '1',
    );
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-finance-owner')).toBe('u1');
    const join = fetcher.mock.calls.find(([url]) => String(url).endsWith('/sync/pull'))!;
    expect(JSON.parse(String(join[1]?.body))).toMatchObject({
      financeCacheOnly: true,
      financeCacheProof: [proof, firstProof, secondProof],
      financeCursor: previous.cursor,
    });
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        previous,
        cursor: previous.cursor,
        records: [],
        tombstones: [],
        cacheProof: mergedProof,
      }),
    );
    expect(JSON.stringify(mocks.commit.mock.calls)).not.toContain('private value');
    expect(JSON.stringify(snapshot)).not.toContain('private value');
    expect(await readFinanceApiSnapshot(snapshot, (data) => data[0].items)).toEqual([
      'private value',
    ]);
    let release!: () => void, enter!: () => void;
    const started = new Promise<void>((resolve) => {
      enter = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pendingRead = readFinanceApiSnapshot(snapshot, async (data) => {
      enter();
      await hold;
      return data[0].items;
    });
    await started;
    disposeFinanceApiSnapshot(snapshot);
    release();
    await expect(pendingRead).rejects.toThrow(/refresh/i);
    await expect(loadFinanceApiSnapshot(async () => ({ arbitrary: 'unproven' }))).rejects.toThrow(
      /refresh/i,
    );
    await expect(readFinanceApiSnapshot(snapshot, () => 'must not run')).rejects.toThrow(
      /refresh/i,
    );
  });
  it.each([undefined, 'invalid-proof'])(
    'rejects a successful GET missing usable source evidence: %s',
    async (token) => {
      fetcher.mockResolvedValue(
        Response.json(
          { items: ['private value'] },
          { headers: token ? { 'x-finance-cache-proof': token } : {} },
        ),
      );
      await expect(
        loadFinanceApiSnapshot((request) => request('/finance/accounts')),
      ).rejects.toThrow(/snapshot|refresh|evidence/i);
      expect(mocks.commit).not.toHaveBeenCalled();
    },
  );
  it('does not publish revoked or unproven snapshots or acknowledge a server cursor', async () => {
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/sync/pull')
        ? Response.json({ financeCache: { status: 'refresh-required' } })
        : Response.json(
            { secret: 'private' },
            { headers: { 'x-finance-cache-proof': firstProof } },
          ),
    );
    await expect(
      loadFinanceApiSnapshot((request) => request('/finance/accounts')),
    ).rejects.toThrow();
    expect(mocks.invalidate).toHaveBeenCalledWith('u1');
    expect(mocks.commit).not.toHaveBeenCalled();
    fetcher.mockClear();
    mocks.invalidate.mockClear();
    mocks.read.mockResolvedValue({ ownerId: 'u1', version: 0, cursor: {} });
    mocks.count.mockResolvedValue(1);
    await expect(
      loadFinanceApiSnapshot((request) => request('/finance/accounts')),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
    expect(mocks.invalidate).toHaveBeenCalledWith('u1');
  });
  it('cannot borrow a fresh visit while its original GET is still loading', async () => {
    fetcher.mockImplementation(async () => {
      access.lock(false);
      await access.synchronize({ requirePin: false, revision: 1, sessionEpoch: 0 });
      return Response.json(
        { secret: 'private' },
        { headers: { 'x-finance-cache-proof': firstProof } },
      );
    });
    await expect(
      loadFinanceApiSnapshot((request) => request('/finance/accounts')),
    ).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('discards retained memory on lock and never lends it to a fresh or different-account visit', async () => {
    const snapshot = await loadFinanceApiSnapshot((request) => request('/finance/accounts'));
    access.lock(false);
    await access.synchronize({ requirePin: false, revision: 1, sessionEpoch: 0 });
    const read = vi.fn(() => 'must not run');
    await expect(readFinanceApiSnapshot(snapshot, read)).rejects.toThrow(/refresh/i);
    await open('u2');
    await expect(readFinanceApiSnapshot(snapshot, read)).rejects.toThrow(/refresh/i);
    expect(read).not.toHaveBeenCalled();
    fetcher.mockImplementation(async (url) =>
      String(url).endsWith('/auth/session')
        ? Response.json({ user: { id: 'another-account', sessionEpoch: 0 } })
        : Response.json({ requirePin: false, enrolled: false, revision: 1 }),
    );
    await expect(refreshFinanceSecurity(access, 'u2')).rejects.toThrow(/same account/i);
    expect(access.canRead()).toBe(false);
  });
  it('rejects a retained value from an earlier cache generation before invoking its reader', async () => {
    const snapshot = await loadFinanceApiSnapshot((request) => request('/finance/accounts'));
    mocks.generation = 'b'.repeat(36);
    const read = vi.fn(() => 'must not run');
    await expect(readFinanceApiSnapshot(snapshot, read)).rejects.toThrow(/refresh/i);
    expect(read).not.toHaveBeenCalled();
    disposeFinanceApiSnapshot(snapshot);
  });
});
