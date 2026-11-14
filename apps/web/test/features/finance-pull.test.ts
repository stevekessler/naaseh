import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FinanceAccessController,
  type FinanceOfflineState,
} from '../../src/features/finance/security/finance-access-controller.js';
import {
  installFinanceAccess,
  clearFinanceAccess,
} from '../../src/features/finance/security/finance-access.js';
import { catchUpFinanceChanges, pullFinanceChanges } from '../../src/sync/finance-pull.js';
import { FinanceClientError } from '../../src/features/finance/finance-client.js';
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  read: vi.fn(),
  commit: vi.fn(),
  invalidate: vi.fn(),
  encrypt: vi.fn(),
  count: vi.fn(),
}));
vi.mock('../../src/features/finance/finance-client.js', () => ({
  financeRequest: mocks.request,
  FinanceClientError: class FinanceClientError extends Error {
    constructor(readonly problem: { code: string }) {
      super(problem.code);
    }
  },
}));
vi.mock('../../src/sync/finance-delivery.js', () => ({
  readFinanceDeliveryCheckpoint: mocks.read,
  commitFinanceDelivery: mocks.commit,
  invalidateFinanceDeliveryCache: mocks.invalidate,
}));
vi.mock('../../src/db/finance-repository.js', () => ({
  financeDeviceKey: async () => ({}),
  encryptFinanceRecord: mocks.encrypt,
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
const account = '01J00000000000000000000001',
  transaction = '01J00000000000000000000002';
const proof = 'fc1.abc.def.ghi';
const previous = {
  ownerId: 'u1',
  version: 1,
  cursor: { owner: 2 },
  cacheProof: proof,
  cacheGeneration: 'a'.repeat(36),
};
const change = {
  audience: 'OWNER#u1',
  sequence: 3,
  entityId: transaction,
  entityType: 'financeTransaction',
  version: 2,
  changedAt: '2026-11-07T00:00:00Z',
  operation: 'upsert',
  payload: { id: transaction, accountId: account, version: 2, description: 'Private transaction' },
};
const response = () => ({
  changes: [{ entityType: 'task', entityId: 'ordinary' }],
  cursor: { owner: 99 },
  financeState: 'ready',
  financeCursor: { owner: 4 },
  financeCache: { status: 'current', proof },
  financeChanges: [change],
});
let access: FinanceAccessController;
async function open(requirePin = false) {
  let state: FinanceOfflineState | undefined;
  access = new FinanceAccessController({
    ownerId: 'u1',
    store: {
      read: async () => state,
      update: async (_owner, update) => (state = update(state)),
      remove: async () => {
        state = undefined;
      },
    },
    unlock: async () => ({
      grant: 'g'.repeat(43),
      securityRevision: 1,
      sessionEpoch: 0,
      expiresAt: new Date(Date.now() + 60000).toISOString(),
    }),
  });
  await access.synchronize({ requirePin, revision: 1, sessionEpoch: 0 });
  installFinanceAccess(access);
}
beforeEach(async () => {
  vi.resetAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  mocks.read.mockResolvedValue(previous);
  mocks.request.mockImplementation(async () => response());
  mocks.count.mockResolvedValue(0);
  mocks.encrypt.mockImplementation(async (input) => ({
    ...input,
    value: { ciphertext: 'encrypted' },
  }));
  await open();
});
afterEach(() => {
  clearFinanceAccess();
  vi.unstubAllGlobals();
});
describe('protected Finance delivery transport', () => {
  it('starts a resumable current-state snapshot for a fresh empty cache', async () => {
    const fresh = { ownerId: 'u1', version: 0, cursor: {} };
    mocks.read.mockResolvedValue(fresh);
    mocks.request.mockResolvedValue({
      financeState: 'ready',
      financeCache: { status: 'current', proof },
      financeBootstrap: {
        records: [
          {
            entityType: 'financeAccount',
            entityId: account,
            version: 1,
            scopeKey: 'OWNER#u1',
            updatedAt: '2026-11-07T00:00:00Z',
            value: { id: account, version: 1, name: 'Checking' },
          },
        ],
        frontier: { public: 7, owner: 11 },
        complete: false,
        nextCursor: 'fb1.next.page.tag',
      },
    });

    expect(await pullFinanceChanges()).toBe(true);
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({
      contractVersion: 8,
      financeCacheProtocol: 1,
      financeBootstrapProtocol: 1,
    });
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        previous: fresh,
        cursor: {},
        bootstrapCursor: 'fb1.next.page.tag',
        cacheProof: proof,
        records: [expect.objectContaining({ id: account, entityType: 'financeAccount' })],
      }),
    );
  });

  it('resumes a snapshot and advances to its captured frontier only when complete', async () => {
    const partial = { ...previous, cursor: {}, bootstrapCursor: 'fb1.next.page.tag' };
    mocks.read.mockResolvedValue(partial);
    mocks.request.mockResolvedValue({
      financeState: 'ready',
      financeCache: { status: 'current', proof },
      financeBootstrap: {
        records: [],
        frontier: { public: 7, owner: 11 },
        complete: true,
      },
    });

    expect(await pullFinanceChanges()).toBe(true);
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({
      contractVersion: 8,
      financeCacheProtocol: 1,
      financeBootstrapProtocol: 1,
      financeBootstrapCursor: partial.bootstrapCursor,
      financeCacheProof: proof,
    });
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({ previous: partial, cursor: { public: 7, owner: 11 } }),
    );
    expect(mocks.commit.mock.calls[0][0]).not.toHaveProperty('bootstrapCursor');
  });

  it('retains its checkpoint when a snapshot page is malformed or crosses scope', async () => {
    mocks.read.mockResolvedValue({ ownerId: 'u1', version: 0, cursor: {} });
    mocks.request.mockResolvedValue({
      financeState: 'ready',
      financeCache: { status: 'current', proof },
      financeBootstrap: {
        records: [
          {
            entityType: 'financeAccount',
            entityId: account,
            version: 1,
            scopeKey: 'OWNER#someone-else',
            updatedAt: '2026-11-07T00:00:00Z',
            value: { id: account, version: 1 },
          },
        ],
        frontier: { owner: 1 },
        complete: true,
      },
    });
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('discards only downloaded cache pages when the server requires a snapshot restart', async () => {
    mocks.read.mockResolvedValue({
      ...previous,
      cursor: {},
      bootstrapCursor: 'fb1.next.page.tag',
    });
    mocks.request.mockRejectedValue(
      new FinanceClientError({
        status: 409,
        code: 'finance_bootstrap_restart_required',
        message: 'Restart.',
      }),
    );
    await expect(pullFinanceChanges()).rejects.toThrow(/restart/i);
    expect(mocks.invalidate).toHaveBeenCalledWith('u1');
    expect(mocks.commit).not.toHaveBeenCalled();
  });

  it('retains legacy CSV row identifiers only when their source batch and ordinal agree', async () => {
    const id = `${account}:1`;
    const payload = {
      ...change.payload,
      id,
      origin: 'csv',
      csvImportBatchId: account,
      csvRowOrdinal: 1,
    };
    mocks.request.mockResolvedValue({
      ...response(),
      financeChanges: [{ ...change, entityId: id, payload }],
    });
    expect(await pullFinanceChanges()).toBe(true);
    expect(mocks.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({ id, entityType: 'financeTransaction', value: payload }),
    );
    mocks.commit.mockClear();
    mocks.request.mockResolvedValue({
      ...response(),
      financeChanges: [{ ...change, entityId: id, payload: { ...payload, csvRowOrdinal: 2 } }],
    });
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
    mocks.request.mockResolvedValue({
      ...response(),
      financeChanges: [{ ...change, entityId: id, operation: 'tombstone', payload: undefined }],
    });
    expect(await pullFinanceChanges()).toBe(true);
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({ tombstones: [{ id, entityType: 'financeTransaction' }] }),
    );
  });

  it.each(['financeBalanceSnapshot', 'financeReconciliation'])(
    'hydrates immutable %s envelopes without inventing a body version',
    async (entityType) => {
      const id = entityType === 'financeBalanceSnapshot' ? `${account}-opening` : transaction;
      const payload = {
        id,
        ...(entityType === 'financeBalanceSnapshot'
          ? { accountId: account }
          : { budgetId: account }),
        marker: 'Immutable record',
      };
      mocks.request.mockResolvedValue({
        ...response(),
        financeChanges: [{ ...change, entityId: id, entityType, version: 1, payload }],
      });
      expect(await pullFinanceChanges()).toBe(true);
      expect(mocks.encrypt).toHaveBeenCalledWith(
        expect.objectContaining({ id, entityType, version: 1, value: payload }),
      );
      expect(payload).not.toHaveProperty('version');
      mocks.commit.mockClear();
      mocks.request.mockResolvedValue({
        ...response(),
        financeChanges: [{ ...change, entityId: id, entityType, version: 2, payload }],
      });
      await expect(pullFinanceChanges()).rejects.toThrow();
      expect(mocks.commit).not.toHaveBeenCalled();
    },
  );

  it('encrypts only the protected lane and atomically commits its proof and independent cursor', async () => {
    expect(await pullFinanceChanges()).toBe(true);
    expect(mocks.request.mock.calls[0][0]).toBe('/sync/pull');
    expect(JSON.parse(mocks.request.mock.calls[0][1].body)).toEqual({
      contractVersion: 8,
      financeCacheProtocol: 1,
      cursor: previous.cursor,
      financeCursor: previous.cursor,
      financeCacheProof: proof,
    });
    expect(mocks.encrypt).toHaveBeenCalledWith(
      expect.objectContaining({
        id: transaction,
        entityType: 'financeTransaction',
        scopeKey: 'OWNER#u1',
        accountId: account,
        version: 2,
        value: change.payload,
      }),
    );
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        previous,
        cursor: { owner: 4 },
        cacheProof: proof,
        records: [expect.objectContaining({ id: transaction })],
        tombstones: [],
      }),
    );
    expect(JSON.stringify(mocks.commit.mock.calls)).not.toContain('ordinary');
  });
  it('does not request or acknowledge while offline, locked, or missing a required connected grant', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    expect(await pullFinanceChanges()).toBe(false);
    vi.stubGlobal('navigator', { onLine: true });
    await open(true);
    expect(await pullFinanceChanges()).toBe(false);
    access.lock(false);
    expect(await pullFinanceChanges()).toBe(false);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it.each([
    { ...change, entityType: 'financeUnknown' },
    { ...change, payload: { ...change.payload, id: account } },
    { ...change, version: 3 },
    { ...change, audience: 'OWNER#someone-else' },
  ])('retains its checkpoint when a delivered row cannot be safely hydrated: %j', async (bad) => {
    mocks.request.mockResolvedValue({ ...response(), financeChanges: [bad] });
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
  it('applies protected tombstones without encrypting ordinary rows or advancing the ordinary cursor', async () => {
    mocks.request.mockResolvedValue({
      ...response(),
      financeChanges: [{ ...change, operation: 'tombstone', payload: undefined }],
    });
    await pullFinanceChanges();
    expect(mocks.encrypt).not.toHaveBeenCalled();
    expect(mocks.commit).toHaveBeenCalledWith(
      expect.objectContaining({
        records: [],
        tombstones: [{ id: transaction, entityType: 'financeTransaction' }],
        cursor: { owner: 4 },
      }),
    );
  });
  it('invalidates known revoked or unproven caches without acknowledging delivery', async () => {
    mocks.request.mockResolvedValue({
      ...response(),
      financeCache: { status: 'refresh-required' },
    });
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(mocks.invalidate).toHaveBeenCalledWith('u1');
    expect(mocks.commit).not.toHaveBeenCalled();
    mocks.request.mockResolvedValue({
      ...response(),
      financeState: 'locked',
      financeCache: { status: 'locked' },
    });
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(access.canRead()).toBe(false);
    await open();
    mocks.request.mockClear();
    mocks.invalidate.mockClear();
    mocks.read.mockResolvedValue({ ownerId: 'u1', version: 0, cursor: {} });
    mocks.count.mockResolvedValue(1);
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(mocks.invalidate).toHaveBeenCalledWith('u1');
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('cannot borrow a fresh visit after a lock during encryption', async () => {
    mocks.encrypt.mockImplementation(async () => {
      access.lock(false);
      await access.synchronize({ requirePin: false, revision: 1, sessionEpoch: 0 });
      return {};
    });
    await expect(pullFinanceChanges()).rejects.toThrow();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});

describe('bounded protected Finance catch-up', () => {
  function durableCheckpoint() {
    let checkpoint = structuredClone(previous);
    mocks.read.mockImplementation(async () => structuredClone(checkpoint));
    mocks.commit.mockImplementation(async (input) => {
      checkpoint = {
        ...checkpoint,
        version: checkpoint.version + 1,
        cursor: input.cursor,
        cacheProof: input.cacheProof,
      };
      return structuredClone(checkpoint);
    });
    return () => checkpoint;
  }
  it('continues through ordinary-only pages using only committed Finance cursors and proof', async () => {
    const current = durableCheckpoint();
    mocks.request
      .mockResolvedValueOnce({
        ...response(),
        financeChanges: [],
        financeCursor: { owner: 202 },
        financeHasMore: true,
      })
      .mockResolvedValueOnce({ ...response(), financeCursor: { owner: 203 }, financeHasMore: true })
      .mockResolvedValueOnce({
        ...response(),
        financeChanges: [],
        financeCursor: { owner: 203 },
        financeHasMore: false,
      });
    expect(await catchUpFinanceChanges()).toEqual({ pages: 3, hasMore: false });
    expect(
      mocks.request.mock.calls.map(([, options]) => JSON.parse(options.body).financeCursor),
    ).toEqual([{ owner: 2 }, { owner: 202 }, { owner: 203 }]);
    expect(current().cursor).toEqual({ owner: 203 });
    expect(mocks.commit).toHaveBeenCalledTimes(3);
    expect(mocks.encrypt).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mocks.commit.mock.calls)).not.toContain('ordinary');
    expect(JSON.stringify(mocks.commit.mock.calls)).not.toContain('99');
  });
  it('caps a continuously full backlog at five pages and resumes from the last commit on the next cycle', async () => {
    const current = durableCheckpoint();
    mocks.request.mockImplementation(async (_path, options) => {
      const cursor = JSON.parse(options.body).financeCursor;
      return {
        ...response(),
        financeChanges: [],
        financeCursor: { owner: cursor.owner + 1 },
        financeHasMore: true,
      };
    });
    expect(await catchUpFinanceChanges()).toEqual({ pages: 5, hasMore: true });
    expect(mocks.request).toHaveBeenCalledTimes(5);
    expect(current().cursor).toEqual({ owner: 7 });
    expect(await catchUpFinanceChanges()).toEqual({ pages: 5, hasMore: true });
    expect(current().cursor).toEqual({ owner: 12 });
  });
  it('does not start another page after the original visit locks even when PIN protection is off', async () => {
    durableCheckpoint();
    mocks.request.mockResolvedValue({ ...response(), financeHasMore: true });
    const commit = mocks.commit.getMockImplementation()!;
    mocks.commit.mockImplementation(async (...args) => {
      const value = await commit(...args);
      access.lock(false);
      return value;
    });
    await expect(catchUpFinanceChanges()).rejects.toThrow();
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.commit).toHaveBeenCalledTimes(1);
  });
  it('rejects a stalled continuation or malformed hint before acknowledging any page', async () => {
    for (const hint of [true, 'yes']) {
      mocks.request.mockResolvedValue({
        ...response(),
        financeCursor: previous.cursor,
        financeHasMore: hint,
      });
      await expect(catchUpFinanceChanges()).rejects.toThrow();
      expect(mocks.commit).not.toHaveBeenCalled();
      expect(mocks.encrypt).not.toHaveBeenCalled();
    }
  });
  it('keeps older-server hints unknown and never makes speculative idle or locked follow-up requests', async () => {
    durableCheckpoint();
    expect(await catchUpFinanceChanges()).toEqual({ pages: 1, hasMore: undefined });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    mocks.request.mockClear();
    mocks.request.mockResolvedValue({ ...response(), financeChanges: [], financeHasMore: false });
    expect(await catchUpFinanceChanges()).toEqual({ pages: 1, hasMore: false });
    expect(mocks.request).toHaveBeenCalledTimes(1);
    await open(true);
    mocks.request.mockClear();
    expect(await catchUpFinanceChanges()).toEqual({ pages: 0, hasMore: undefined });
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('retains the last committed page when a later page fails', async () => {
    const current = durableCheckpoint();
    mocks.request
      .mockResolvedValueOnce({ ...response(), financeHasMore: true })
      .mockRejectedValueOnce(new Error('Synthetic next-page network failure'));
    await expect(catchUpFinanceChanges()).rejects.toThrow(/next-page/);
    expect(current().cursor).toEqual({ owner: 4 });
    expect(mocks.commit).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });
});
