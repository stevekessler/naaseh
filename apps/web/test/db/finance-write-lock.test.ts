import {
  readFinanceCachedData,
  maintainFinanceCache,
} from '../../src/sync/finance-cache-access.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpcomingExpense } from '@naaseh/domain';
import {
  FinanceAccessController,
  type FinanceOfflineState,
} from '../../src/features/finance/security/finance-access-controller.js';
import {
  clearFinanceAccess,
  installFinanceAccess,
} from '../../src/features/finance/security/finance-access.js';
import { queueEncryptedCsvChunks } from '../../src/features/finance/csv/csv-import.js';
import {
  applyFinancePull,
  decryptFinanceRecord,
  readSavedCsvImports,
  readSavedCsvImportPreview,
  recoverSavedCsvImport,
  commitFinanceReplayOutcome,
  purgeFinanceScope,
  queueEncryptedBudgetCreationPlan,
  queueEncryptedBudgetMutation,
  queueEncryptedFulfillmentProposal,
  queueEncryptedUpcomingExpenseMutation,
  queueFinanceReceiptBytes,
} from '../../src/db/finance-repository.js';
import {
  commitFinanceDelivery,
  invalidateFinanceDeliveryCache,
  readFinanceDeliveryCheckpoint,
  invalidateFinanceForAccessRevocation,
} from '../../src/sync/finance-delivery.js';
import type { EncryptedFinanceRecord, StoredMutation } from '../../src/db/database.js';

const state = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  settings: new Map<string, { key: string; value: string }>(),
  outbox: new Map<string, StoredMutation>(),
  bytes: new Map<string, unknown>(),
  conflicts: new Map<string, unknown>(),
  beforeCommit: undefined as (() => Promise<void>) | undefined,
  beforePut: undefined as (() => Promise<void>) | undefined,
  beforeEncrypt: undefined as (() => Promise<void>) | undefined,
  transaction: undefined as { abort: () => void } | undefined,
  abort: vi.fn(),
}));
vi.mock('dexie', () => ({
  default: {
    get currentTransaction() {
      return state.transaction;
    },
  },
}));
vi.mock('../../src/crypto/vault.js', () => ({
  decryptText: async (value: { ciphertext: string }) => value.ciphertext,
  encryptText: async (plaintext: string) => {
    const pause = state.beforeEncrypt;
    state.beforeEncrypt = undefined;
    await pause?.();
    return { iv: 'synthetic', ciphertext: plaintext };
  },
}));
vi.mock('../../src/db/finance-device-key.js', () => ({
  financeBootstrapDeviceKey: async () => ({}),
}));
vi.mock('../../src/db/database.js', () => ({
  db: {
    settings: {
      delete: async (key: string) => {
        state.settings.delete(key);
      },
      get: async (key: string) => state.settings.get(key),
      put: async (row: { key: string; value: string }) => {
        state.settings.set(row.key, row);
      },
    },
    secureFinanceRecords: {
      toCollection: () => ({ primaryKeys: async () => [...state.rows.keys()] }),
      get: async (id: string) => state.rows.get(id),
      count: async () => state.rows.size,
      clear: async () => {
        state.rows.clear();
      },
      where: (field: string) => ({
        equals: (value: string) => ({
          toArray: async () =>
            [...state.rows.values()].filter(
              (row) => (row as Record<string, unknown>)[field] === value,
            ),
        }),
      }),
      bulkDelete: async (ids: string[]) => {
        for (const id of ids) state.rows.delete(id);
      },
      put: async (row: EncryptedFinanceRecord) => {
        const pause = state.beforePut;
        state.beforePut = undefined;
        await pause?.();
        state.rows.set(row.id, row);
      },
      delete: async (id: string) => {
        state.rows.delete(id);
      },
    },
    secureConflicts: {
      get: async (id: string) => state.conflicts.get(id),
      put: async (row: { id: string }) => {
        state.conflicts.set(row.id, row);
      },
    },
    outbox: {
      where: () => ({
        equals: (id: string) => ({
          toArray: async () => [...state.outbox.values()].filter((item) => item.entityId === id),
        }),
        anyOf: (ids: string[]) => ({
          delete: async () => {
            for (const [id, item] of state.outbox)
              if (ids.includes(item.entityId)) state.outbox.delete(id);
          },
        }),
      }),
      get: async (id: string) => state.outbox.get(id),
      delete: async (id: string) => {
        state.outbox.delete(id);
      },
      toArray: async () => [...state.outbox.values()],
      add: async (mutation: StoredMutation) => {
        state.outbox.set(mutation.id, mutation);
      },
    },
    secureFinancePendingBytes: {
      put: async (row: { id: string }) => {
        state.bytes.set(row.id, row);
      },
    },
    transaction: async (_mode: string, ...args: unknown[]) => {
      const snapshots = [
        new Map(state.rows),
        new Map(state.outbox),
        new Map(state.bytes),
        new Map(state.settings),
        new Map(state.conflicts),
      ] as const;
      let aborted = false;
      state.transaction = {
        abort: () => {
          aborted = true;
          state.abort();
        },
      };
      try {
        const result = await (args.at(-1) as () => Promise<unknown>)();
        const pause = state.beforeCommit;
        state.beforeCommit = undefined;
        await pause?.();
        if (aborted) throw new Error('Transaction aborted');
        return result;
      } catch (error) {
        state.rows = snapshots[0];
        state.outbox = snapshots[1];
        state.bytes = snapshots[2];
        state.settings = snapshots[3];
        state.conflicts = snapshots[4];
        throw error;
      } finally {
        state.transaction = undefined;
      }
    },
  },
}));

let controller: FinanceAccessController;
const record: EncryptedFinanceRecord = {
  id: 'receipt',
  entityType: 'financeReceipt',
  scopeKey: 'OWNER#u1',
  version: 1,
  updatedAt: '2026-11-06T00:00:00Z',
  value: { iv: 'synthetic', ciphertext: 'original' },
};
const mutation: StoredMutation = {
  id: 'receipt-edit',
  entityType: 'financeReceipt',
  entityId: record.id,
  operation: 'create',
  baseVersion: 0,
  createdAt: record.updatedAt,
  attempts: 0,
  payload: record.value,
};
beforeEach(async () => {
  state.settings.clear();
  state.conflicts.clear();
  state.rows.clear();
  state.outbox.clear();
  state.bytes.clear();
  state.abort.mockClear();
  state.beforeCommit = undefined;
  state.beforePut = undefined;
  state.beforeEncrypt = undefined;
  let stored: FinanceOfflineState | undefined;
  controller = new FinanceAccessController({
    ownerId: 'u1',
    store: {
      read: async () => stored,
      update: async (_id, update) => (stored = update(stored)),
      remove: async () => {
        stored = undefined;
      },
    },
    unlock: async () => ({
      grant: 'g'.repeat(43),
      securityRevision: 1,
      sessionEpoch: 1,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    }),
    derive: async () => 'a'.repeat(64),
  });
  installFinanceAccess(controller);
  await controller.synchronize({ requirePin: true, revision: 1, sessionEpoch: 1 });
});
afterEach(() => {
  clearFinanceAccess();
  vi.unstubAllGlobals();
});
const lockAndReopen = async () => {
  controller.lock(false);
  await controller.unlockOnline('001234');
};

describe('Finance writes stay within their original unlocked visit', () => {
  it('atomically encrypts a stable-ID budget draft with its matching create intent', async () => {
    await controller.unlockOnline('001234');
    const budgetId = '01J00000000000000000000701';
    const value = {
      id: budgetId,
      groupId: '01J00000000000000000000702',
      name: 'Offline household plan',
      budgetDate: '2026-12-01',
      startDate: '2026-12-01',
      endDate: null,
      status: 'draft',
      version: 1,
    };

    const queued = await queueEncryptedBudgetMutation({
      entityId: budgetId,
      entityType: 'financeBudget',
      budgetId,
      scopeKey: `GROUP#${value.groupId}`,
      baseVersion: 0,
      value,
    });

    expect(queued.record).toMatchObject({
      id: budgetId,
      entityType: 'financeBudget',
      budgetId,
      version: 1,
    });
    expect(JSON.parse((queued.record.value as { ciphertext: string }).ciphertext)).toEqual(value);
    const intent = state.outbox.get(queued.mutationId)!;
    expect(intent).toMatchObject({
      entityId: budgetId,
      entityType: 'financeBudget',
      operation: 'create',
      baseVersion: 0,
    });
    expect(JSON.parse((intent.payload as { ciphertext: string }).ciphertext)).toEqual(value);
  });
  it('preserves original upcoming date context and keeps offline payment links provisional', async () => {
    await controller.unlockOnline('001234');
    const expense = createUpcomingExpense({
      id: '01J00000000000000000000731',
      groupId: '01J00000000000000000000732',
      accountId: '01J00000000000000000000733',
      budgetId: '01J00000000000000000000734',
      description: 'Insurance renewal',
      expectedAmountMinor: 12_000,
      currency: 'USD',
      dueDate: '2026-11-03',
      entryContext: {
        enteredAt: '2026-10-31T18:00:00.000Z',
        localDate: '2026-10-31',
        timeZone: 'America/Denver',
      },
      creatorId: 'u1',
      acceptedAt: '2026-10-31T18:00:00.000Z',
    });
    const createPayload = {
      id: expense.id,
      groupId: expense.groupId,
      accountId: expense.accountId,
      budgetId: expense.budgetId,
      description: expense.description,
      expectedAmountMinor: expense.expectedAmountMinor,
      dueDate: expense.dueDate,
      entryContext: expense.entryContext,
    };
    const queued = await queueEncryptedUpcomingExpenseMutation({
      expense,
      scopeKey: 'OWNER#u1',
      baseVersion: 0,
      payloadValue: createPayload,
      createdAt: '2026-11-05T18:00:00.000Z',
    });
    const savedExpense = JSON.parse(
      (queued.record.value as { ciphertext: string }).ciphertext,
    ) as typeof expense;
    expect(savedExpense).toMatchObject({
      dueDate: '2026-11-03',
      entryContext: {
        enteredAt: '2026-10-31T18:00:00.000Z',
        localDate: '2026-10-31',
        timeZone: 'America/Denver',
      },
    });
    expect(
      JSON.parse(
        (state.outbox.get(queued.mutationId)!.payload as { ciphertext: string }).ciphertext,
      ),
    ).toEqual(createPayload);

    const proposal = await queueEncryptedFulfillmentProposal({
      fulfillmentId: '01J00000000000000000000735',
      upcomingExpenseId: expense.id,
      accountId: expense.accountId,
      scopeKey: 'OWNER#u1',
      value: {
        id: '01J00000000000000000000735',
        transactionId: '01J00000000000000000000736',
        amountMinor: 2_000,
        expectedExpenseVersion: 1,
        expectedTransactionVersion: 1,
        expectedClaimVersion: 0,
      },
      createdAt: '2026-11-05T18:00:01.000Z',
    });
    expect(proposal.record).toMatchObject({
      entityType: 'financeFulfillment',
      lifecycle: 'proposal',
    });
    expect(JSON.parse((proposal.record.value as { ciphertext: string }).ciphertext)).toMatchObject({
      proposalStatus: 'pending-server-acceptance',
    });
  });
  it('atomically retains a budget and selected-account links in dependency order', async () => {
    await controller.unlockOnline('001234');
    const budgetId = '01J00000000000000000000711';
    const groupId = '01J00000000000000000000712';
    const value = {
      id: budgetId,
      groupId,
      name: 'Offline linked plan',
      budgetDate: '2026-12-01',
      startDate: '2026-12-01',
      endDate: null,
      status: 'draft',
      version: 1,
    };
    const result = await queueEncryptedBudgetCreationPlan({
      budgetId,
      groupId,
      scopeKey: `GROUP#${groupId}`,
      value,
      accountIds: ['01J00000000000000000000713', '01J00000000000000000000714'],
      createdAt: '2026-11-12T00:00:00.000Z',
    });
    expect(result.records.map(({ entityType }) => entityType)).toEqual([
      'financeBudget',
      'financeBudgetAccountLink',
      'financeBudgetAccountLink',
    ]);
    expect(result.mutations.map(({ financeDependencyId }) => financeDependencyId)).toEqual([
      undefined,
      result.mutations[0]!.id,
      result.mutations[1]!.id,
    ]);
    expect(result.mutations.map(({ createdAt }) => createdAt)).toEqual([
      '2026-11-12T00:00:00.000Z',
      '2026-11-12T00:00:00.001Z',
      '2026-11-12T00:00:00.002Z',
    ]);
    expect(
      result.mutations.slice(1).map((intent) => {
        const payload = JSON.parse((intent.payload as { ciphertext: string }).ciphertext);
        return [payload.budgetId, payload.expectedBudgetVersion];
      }),
    ).toEqual([
      [budgetId, 1],
      [budgetId, 2],
    ]);
    expect(state.rows.size).toBe(3);
    expect(state.outbox.size).toBe(3);

    const before = JSON.stringify([[...state.rows], [...state.outbox]]);
    state.beforeCommit = async () => {
      throw new Error('synthetic budget-plan storage failure');
    };
    await expect(
      queueEncryptedBudgetCreationPlan({
        budgetId: '01J00000000000000000000715',
        groupId,
        scopeKey: `GROUP#${groupId}`,
        value: { ...value, id: '01J00000000000000000000715' },
        accountIds: ['01J00000000000000000000713'],
      }),
    ).rejects.toThrow(/storage failure/i);
    expect(JSON.stringify([[...state.rows], [...state.outbox]])).toBe(before);
  });
  it('invalidates Finance evidence on an ordinary task revocation while retaining pending work and the ordinary cursor', async () => {
    await controller.unlockOnline('001234');
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: { owner: 1 },
      records: [record],
      tombstones: [],
      cacheProof: 'fc1.old.evidence.tag',
    });
    state.outbox.set(mutation.id, mutation);
    const pending = structuredClone(state.rows.get(record.id));
    state.settings.set('sync-cursor', {
      key: 'sync-cursor',
      value: 'ordinary-task-already-committed',
    });
    controller.lock(false);
    await expect(invalidateFinanceForAccessRevocation()).resolves.toBeUndefined();
    expect(state.settings.has('finance-delivery:u1')).toBe(false);
    expect(state.settings.get('sync-cursor')?.value).toBe('ordinary-task-already-committed');
    expect(state.rows.get(record.id)).toEqual(pending);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    await expect(controller.unlockOffline('001234')).rejects.toThrow(/connect/i);
  });
  it('does not make ordinary task progress fail when Finance invalidation storage fails', async () => {
    await controller.unlockOnline('001234');
    state.settings.set('sync-cursor', {
      key: 'sync-cursor',
      value: 'ordinary-task-already-committed',
    });
    state.rows.set(record.id, record);
    state.outbox.set(mutation.id, mutation);
    state.beforeCommit = async () => {
      throw new Error('synthetic Finance storage failure');
    };
    await expect(invalidateFinanceForAccessRevocation()).resolves.toBeUndefined();
    expect(controller.canRead()).toBe(false);
    expect(state.settings.get('sync-cursor')?.value).toBe('ordinary-task-already-committed');
    expect(state.rows.get(record.id)).toEqual(record);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
  });
  it('closes an active legacy Finance view even before it has a trusted cache checkpoint', async () => {
    await controller.unlockOnline('001234');
    state.rows.set(record.id, record);
    await invalidateFinanceForAccessRevocation();
    expect(controller.canRead()).toBe(false);
    expect(state.rows.has(record.id)).toBe(false);
  });
  const savedCsv = {
    accountId: '01J00000000000000000000981',
    batchId: '01J00000000000000000000982',
    scopeKey: 'OWNER#u1',
    rows: [
      {
        ordinal: 1,
        description: 'Synthetic pending input',
        amountMinor: -100,
        transactedAt: '2026-11-09T00:00:00.000Z',
      },
    ],
    key: {} as CryptoKey,
  };
  it('summarizes paired legacy CSV rows for the requested account without consuming them', async () => {
    await controller.unlockOnline('001234');
    await queueEncryptedCsvChunks(savedCsv);
    const before = JSON.stringify([[...state.rows], [...state.outbox]]);
    expect(await readSavedCsvImports(savedCsv.accountId, savedCsv.scopeKey)).toEqual([
      { batchId: savedCsv.batchId, rowCount: 1, complete: true },
    ]);
    expect(await readSavedCsvImports(savedCsv.accountId, 'GROUP#different')).toEqual([]);
    expect(
      await readSavedCsvImportPreview(savedCsv.accountId, savedCsv.scopeKey, savedCsv.batchId),
    ).toMatchObject({ rows: savedCsv.rows });
    expect(
      await readSavedCsvImportPreview(savedCsv.accountId, 'GROUP#different', savedCsv.batchId),
    ).toBeUndefined();
    expect(JSON.stringify([[...state.rows], [...state.outbox]])).toBe(before);
  });

  it('pages past 100 saved rows without losing ordinals across queue chunks', async () => {
    await controller.unlockOnline('001234');
    const rows = Array.from({ length: 101 }, (_, index) => ({
      ...savedCsv.rows[0]!,
      ordinal: index + 1,
    }));
    await queueEncryptedCsvChunks({ ...savedCsv, rows });
    const { accountId, scopeKey, batchId } = savedCsv;
    const first = await readSavedCsvImportPreview(accountId, scopeKey, batchId);
    const last = await readSavedCsvImportPreview(accountId, scopeKey, batchId, {
      offset: 100,
      limit: 25,
    });
    expect(first).toMatchObject({ offset: 0, limit: 100, rowCount: 101, complete: true });
    expect(first?.rows.map(({ ordinal }) => ordinal)).toEqual(
      rows.slice(0, 100).map(({ ordinal }) => ordinal),
    );
    expect(last).toMatchObject({
      offset: 100,
      limit: 25,
      rowCount: 101,
      complete: true,
      rows: [rows[100]],
    });
    expect(state.outbox.size).toBe(2);
  });

  it('retains the encrypted recovery plan across dispatch failure and acknowledges the exact retry', async () => {
    await controller.unlockOnline('001234');
    await queueEncryptedCsvChunks({
      ...savedCsv,
      rows: Array.from({ length: 101 }, (_, index) => ({
        ...savedCsv.rows[0]!,
        ordinal: index + 1,
      })),
    });
    state.rows.delete(`${savedCsv.batchId}:1`);
    for (const [id, item] of state.outbox) {
      if (item.entityId === `${savedCsv.batchId}:1`) state.outbox.delete(id);
    }
    const prepare = vi.fn(async (rows: typeof savedCsv.rows) => [
      {
        batchId: '01J00000000000000000000983',
        fileDigest: 'a'.repeat(64),
        mapping: {
          dateColumn: 'Date',
          descriptionColumn: 'Description',
          dateFormat: 'YYYY-MM-DD' as const,
          amountMapping: { mode: 'signed' as const, amountColumn: 'Amount' },
        },
        duplicateDecisionDigest: 'b'.repeat(64),
        duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 as const },
        chunkIndex: 0,
        finalChunk: true,
        rows: rows.map((row) => ({
          ...row,
          duplicateDisposition: 'not-suspected' as const,
        })),
      },
    ]);
    const dispatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Connection interrupted'))
      .mockResolvedValueOnce(undefined);
    const { accountId, scopeKey, batchId } = savedCsv;
    const request = { accountId, scopeKey, batchId, resume: false, prepare, dispatch };
    await expect(recoverSavedCsvImport(request)).rejects.toThrow('Connection interrupted');
    const pending = [...state.outbox.values()][0]!;
    state.outbox.set(pending.id, { ...pending, attempts: pending.attempts + 1 });
    expect(state.outbox.size).toBe(1);
    expect(state.rows.size).toBe(1);
    expect(await readSavedCsvImportPreview(accountId, scopeKey, batchId)).toMatchObject({
      submissionPending: true,
      partialRecoveryAvailable: true,
      complete: false,
    });
    await expect(recoverSavedCsvImport(request)).rejects.toThrow('Saved CSV submission changed.');
    await recoverSavedCsvImport({ ...request, resume: true });
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare.mock.calls[0]?.[0]).toHaveLength(100);
    expect(dispatch.mock.calls[0]?.[0]).toEqual(dispatch.mock.calls[1]?.[0]);
    expect(state.outbox.size).toBe(0);
    expect(state.rows.size).toBe(0);
    expect([...state.settings.keys()].some((key) => key.startsWith('finance-csv-recovery:'))).toBe(
      false,
    );
  });

  it('keeps saved CSV chunks with a gap available for inspection without dispatching them', async () => {
    await controller.unlockOnline('001234');
    await queueEncryptedCsvChunks({
      ...savedCsv,
      rows: Array.from({ length: 201 }, (_, index) => ({
        ...savedCsv.rows[0]!,
        ordinal: index + 1,
      })),
    });
    const { accountId, scopeKey, batchId } = savedCsv;
    state.rows.delete(`${batchId}:1`);
    for (const [id, item] of state.outbox) {
      if (item.entityId === `${batchId}:1`) state.outbox.delete(id);
    }
    const prepare = vi.fn();
    const dispatch = vi.fn();
    const preview = await readSavedCsvImportPreview(accountId, scopeKey, batchId);
    expect(preview).toMatchObject({ complete: false, rowCount: 101 });
    expect(preview?.partialRecoveryAvailable).toBeUndefined();
    await expect(
      recoverSavedCsvImport({
        accountId,
        scopeKey,
        batchId,
        resume: false,
        prepare,
        dispatch,
      }),
    ).rejects.toThrow('continuous sequence');
    expect(prepare).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(state.outbox.size).toBe(2);
  });

  it('withholds a saved CSV batch when staging and outbox rows disagree', async () => {
    await controller.unlockOnline('001234');
    await queueEncryptedCsvChunks(savedCsv);
    const item = [...state.outbox.values()][0]!;
    const chunk = JSON.parse(item.payload.ciphertext);
    chunk.rows[0].amountMinor = -200;
    item.payload.ciphertext = JSON.stringify(chunk);
    await expect(readSavedCsvImports(savedCsv.accountId, savedCsv.scopeKey)).rejects.toThrow(
      'Saved CSV data could not be verified.',
    );
    expect(state.outbox.size).toBe(1);
  });

  it('preserves pending CSV staging and intent byte-for-byte while invalidating server projections', async () => {
    await controller.unlockOnline('001234');
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: { owner: 1 },
      records: [{ ...record, id: 'server-only' }],
      tombstones: [],
      cacheProof: 'fc1.old.evidence.tag',
    });
    const review = {
      fileDigest: 'a'.repeat(64),
      mapping: {
        dateColumn: 'Date',
        descriptionColumn: 'Memo',
        dateFormat: 'YYYY-MM-DD' as const,
        amountMapping: { mode: 'signed' as const, amountColumn: 'Amount' },
      },
      duplicateDecisionDigest: 'b'.repeat(64),
      duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 as const },
    };
    await queueEncryptedCsvChunks({
      accountId: 'retained-account',
      batchId: 'retained-batch',
      scopeKey: 'OWNER#u1',
      rows: [{ ordinal: 1, description: 'Synthetic pending input' }],
      review,
      key: {} as CryptoKey,
    });
    const staging = structuredClone(state.rows.get('retained-batch:0')) as EncryptedFinanceRecord;
    const intent = structuredClone([...state.outbox.values()][0]!);
    const chunk = JSON.parse(staging.value.ciphertext);
    expect(chunk).toMatchObject({
      format: 1,
      accountId: 'retained-account',
      scopeKey: 'OWNER#u1',
      ...review,
    });
    expect(JSON.parse(intent.payload.ciphertext)).toEqual(chunk);
    await invalidateFinanceDeliveryCache('u1');
    expect(state.rows.has('server-only')).toBe(false);
    expect(state.rows.get(staging.id)).toEqual(staging);
    expect(state.outbox.get(intent.id)).toEqual(intent);
    expect(staging.accountId).toBe('retained-account');
    expect(state.settings.has('finance-delivery:u1')).toBe(false);
    expect(controller.canRead()).toBe(false);
    await controller.unlockOnline('001234');
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: {},
      records: [],
      tombstones: [],
      cacheProof: 'fc1.fresh.evidence.tag',
    });
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ financeCache: { status: 'current', proof: 'fc1.fresh.evidence.tag' } }),
      ),
    );
    await expect(decryptFinanceRecord(staging, {} as CryptoKey)).rejects.toThrow(/unproven/i);
    expect(state.rows.get(staging.id)).toEqual(staging);
  });
  it('rolls invalidation back atomically if its final storage commit fails', async () => {
    await controller.unlockOnline('001234');
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: { owner: 1 },
      records: [record],
      tombstones: [],
      cacheProof: 'fc1.old.evidence.tag',
    });
    state.outbox.set(mutation.id, mutation);
    const before = JSON.stringify([[...state.rows], [...state.settings], [...state.outbox]]);
    state.beforeCommit = async () => {
      throw new Error('synthetic rollback');
    };
    await expect(invalidateFinanceDeliveryCache('u1')).rejects.toThrow(/synthetic rollback/i);
    expect(JSON.stringify([[...state.rows], [...state.settings], [...state.outbox]])).toBe(before);
    expect(controller.canRead()).toBe(false);
  });
  it.each(['fresh unlock', 'account switch'])(
    'does not queue CSV encryption completed after %s',
    async (change) => {
      await controller.unlockOnline('001234');
      state.beforeEncrypt = async () => {
        if (change === 'fresh unlock') await lockAndReopen();
        else {
          clearFinanceAccess();
          const next = new FinanceAccessController({
            ownerId: 'u2',
            store: {
              read: async () => undefined,
              update: async (_id, update) => update(undefined),
              remove: async () => undefined,
            },
            unlock: async () => {
              throw new Error('No PIN in the next account');
            },
          });
          await next.synchronize({ requirePin: false, revision: 1, sessionEpoch: 1 });
          installFinanceAccess(next);
        }
      };
      await expect(
        queueEncryptedCsvChunks({
          accountId: 'account',
          batchId: 'batch',
          scopeKey: 'OWNER#u1',
          rows: [{ ordinal: 1, description: 'Private row' }],
          key: {} as CryptoKey,
        }),
      ).rejects.toThrow(/unlock/i);
      expect(state.rows.size).toBe(0);
      expect(state.outbox.size).toBe(0);
    },
  );
  it('retains an already committed CSV prefix when the next chunk loses its original visit', async () => {
    await controller.unlockOnline('001234');
    let originalPrefix: string | undefined;
    state.beforeCommit = async () => {
      originalPrefix = JSON.stringify([[...state.rows], [...state.outbox]]);
      state.beforeEncrypt = lockAndReopen;
    };
    await expect(
      queueEncryptedCsvChunks({
        accountId: 'account',
        batchId: 'batch',
        scopeKey: 'OWNER#u1',
        rows: Array.from({ length: 101 }, (_, index) => ({ ordinal: index + 1 })),
        key: {} as CryptoKey,
      }),
    ).rejects.toThrow(/unlock/i);
    expect([...state.rows.keys()]).toEqual(['batch:0']);
    expect(state.outbox.size).toBe(1);
    expect(JSON.stringify([[...state.rows], [...state.outbox]])).toBe(originalPrefix);
    expect([...state.outbox.values()][0]).toMatchObject({
      entityId: 'batch:0',
      operation: 'commitCsvChunk',
      attempts: 0,
    });
  });
  it('bootstraps an empty server cache while preserving an unproven encrypted pending CSV projection', async () => {
    await controller.unlockOnline('001234');
    const pending = {
      ...mutation,
      id: 'csv-edit',
      entityId: 'csv-batch:0',
      entityType: 'financeTransaction' as const,
    };
    const row = { ...record, id: pending.entityId, entityType: 'financeCsvChunk' };
    state.rows.set(row.id, row);
    state.outbox.set(pending.id, pending);
    vi.stubGlobal('navigator', { onLine: true });
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockImplementation(async () =>
        Response.json({
          financeCache: { status: 'current', proof: 'fc1.nonce.synthetic-proof.tag' },
        }),
      ),
    );
    expect(
      await readFinanceCachedData(async (lease) => {
        await expect(decryptFinanceRecord(row, {} as CryptoKey, lease)).rejects.toThrow(
          /unproven|refresh/i,
        );
        return 'ready';
      }),
    ).toBe('ready');
    expect(state.rows.get(row.id)).toEqual(row);
    expect(state.outbox.get(pending.id)).toEqual(pending);
    expect((state.rows.get(row.id) as EncryptedFinanceRecord).cacheGeneration).toBeUndefined();
    expect((await readFinanceDeliveryCheckpoint('u1')).cacheGeneration).toBeTruthy();
    expect(controller.canRead()).toBe(true);
  });
  it('rejects unproven legacy cache before plaintext, preserving encrypted pending work', async () => {
    await controller.unlockOnline('001234');
    const row = {
      ...record,
      id: 'untrusted-cached-row',
      value: { iv: 'synthetic', ciphertext: JSON.stringify({ secret: 'old cache' }) },
    };
    state.rows.set(row.id, row);
    state.outbox.set(mutation.id, mutation);
    vi.stubGlobal('navigator', { onLine: true });
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal('fetch', fetcher);
    await expect(decryptFinanceRecord(row, {} as CryptoKey)).rejects.toThrow(/refresh|connect/i);
    expect(state.rows.size).toBe(0);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    expect(fetcher).not.toHaveBeenCalled();
    expect(controller.canRead()).toBe(false);
  });
  it('serializes protected delivery with an entire cached read batch in both directions', async () => {
    const proof = 'fc1.nonce.encrypted-dependency-evidence.tag';
    await controller.unlockOnline('001234');
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: {},
      records: [],
      tombstones: [],
      cacheProof: proof,
    });
    vi.stubGlobal('navigator', { onLine: true });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ financeCache: { status: 'current', proof } }),
      );
    vi.stubGlobal('fetch', fetcher);
    let release!: () => void, started!: () => void;
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const first = readFinanceCachedData(async () => {
      order.push('read');
      started();
      await hold;
      order.push('read-end');
    });
    await entered;
    const delivery = maintainFinanceCache(async () => {
      order.push('delivery');
    });
    await Promise.resolve();
    expect(order).toEqual(['read']);
    release();
    await Promise.all([first, delivery]);
    expect(order).toEqual(['read', 'read-end', 'delivery']);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const enteredDelivery = new Promise<void>((resolve) => {
      started = resolve;
    });
    const holdDelivery = new Promise<void>((resolve) => {
      release = resolve;
    });
    const nextDelivery = maintainFinanceCache(async () => {
      order.push('next-delivery');
      started();
      await holdDelivery;
      order.push('delivery-end');
    });
    await enteredDelivery;
    const nextRead = readFinanceCachedData(async () => {
      order.push('next-read');
    });
    await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
    release();
    await Promise.all([nextDelivery, nextRead]);
    expect(order.slice(-3)).toEqual(['next-delivery', 'delivery-end', 'next-read']);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('does not replace or delete a different Finance kind with a colliding identifier', async () => {
    await controller.unlockOnline('001234');
    state.rows.set(record.id, record);
    const different = {
      ...record,
      entityType: record.entityType === 'financeBudget' ? 'financeTransaction' : 'financeBudget',
    };
    await expect(applyFinancePull({ records: [different], tombstones: [] })).rejects.toThrow(
      /kind|type|collision/i,
    );
    expect(state.rows.get(record.id)).toEqual(record);
    await expect(
      applyFinancePull({
        records: [],
        tombstones: [{ id: record.id, entityType: different.entityType as never }],
      }),
    ).rejects.toThrow(/kind|type|collision/i);
    expect(state.rows.get(record.id)).toEqual(record);
  });
  it('checks online batch cache rights before and after plaintext, and limits offline reads to the trusted checkpoint', async () => {
    await controller.unlockOnline('001234');
    const row = {
      ...record,
      value: { iv: 'synthetic', ciphertext: JSON.stringify({ secret: 'authorized' }) },
    };
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: { owner: 4 },
      records: [row],
      tombstones: [],
      cacheProof: 'fc1.old.evidence.tag',
    });
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ financeCache: { status: 'current', proof: 'fc1.new.evidence.tag' } }),
      );
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('navigator', { onLine: true });
    const cached = state.rows.get(row.id) as EncryptedFinanceRecord;
    let savedLease: Parameters<typeof decryptFinanceRecord>[2];
    expect(
      await readFinanceCachedData(async (lease) => {
        savedLease = lease;
        await expect(
          decryptFinanceRecord(
            { ...cached, cacheGeneration: 'an-old-cache-generation' },
            {} as CryptoKey,
            lease,
          ),
        ).rejects.toThrow(/unproven|refresh/i);
        return Promise.all([
          decryptFinanceRecord(cached, {} as CryptoKey, lease),
          decryptFinanceRecord(cached, {} as CryptoKey, lease),
        ]);
      }),
    ).toEqual([{ secret: 'authorized' }, { secret: 'authorized' }]);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const body = JSON.parse(fetcher.mock.calls[0]![1]!.body as string);
    expect(body).toMatchObject({
      financeCacheOnly: true,
      financeCacheProtocol: 1,
      financeCursor: { owner: 4 },
    });
    expect((await readFinanceDeliveryCheckpoint('u1')).cursor).toEqual({ owner: 4 });
    await expect(decryptFinanceRecord(cached, {} as CryptoKey, savedLease!)).rejects.toThrow(
      /refresh|expired/i,
    );
    expect(
      await Promise.all([
        readFinanceCachedData((lease) => decryptFinanceRecord(cached, {} as CryptoKey, lease)),
        readFinanceCachedData((lease) => decryptFinanceRecord(cached, {} as CryptoKey, lease)),
      ]),
    ).toEqual([{ secret: 'authorized' }, { secret: 'authorized' }]);
    expect(fetcher).toHaveBeenCalledTimes(4); // Concurrent widgets share one before/after check.
    vi.stubGlobal('navigator', { onLine: false });
    controller.lock(false);
    await controller.unlockOffline('001234');
    expect(await decryptFinanceRecord(cached, {} as CryptoKey)).toEqual({ secret: 'authorized' });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it('withholds a batch revoked during decryption and keeps pending work through invalidation', async () => {
    await controller.unlockOnline('001234');
    const row = {
      ...record,
      value: { iv: 'synthetic', ciphertext: JSON.stringify({ secret: 'must not return' }) },
    };
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: { owner: 4 },
      records: [row],
      tombstones: [],
      cacheProof: 'fc1.old.evidence.tag',
    });
    state.outbox.set(mutation.id, mutation);
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ financeCache: { status: 'current', proof: 'fc1.new.evidence.tag' } }),
      )
      .mockResolvedValueOnce(Response.json({ financeCache: { status: 'refresh-required' } }));
    vi.stubGlobal('fetch', fetcher);
    vi.stubGlobal('navigator', { onLine: true });
    const cached = state.rows.get(row.id) as EncryptedFinanceRecord;
    let decrypted = false;
    await expect(
      readFinanceCachedData(async (lease) => {
        await decryptFinanceRecord(cached, {} as CryptoKey, lease);
        decrypted = true;
        return 'must not return';
      }),
    ).rejects.toThrow(/refresh|connect/i);
    expect(decrypted).toBe(true);
    expect(state.rows.get(cached.id)).toEqual(cached);
    expect(state.settings.has('finance-delivery:u1')).toBe(false);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    expect(controller.canRead()).toBe(false);
  });
  it('stores cache proof with its encrypted delivery checkpoint and requires renewed evidence for later acknowledgement', async () => {
    await controller.unlockOnline('001234');
    const proof = 'fc1.nonce.encrypted-dependency-evidence.tag';
    const previous = await readFinanceDeliveryCheckpoint('u1');
    const saved = await commitFinanceDelivery({
      previous,
      cursor: { owner: 1 },
      records: [],
      tombstones: [],
      cacheProof: proof,
    });
    expect(saved.cacheProof).toBe(proof);
    expect((await readFinanceDeliveryCheckpoint('u1')).cacheProof).toBe(proof);
    await expect(
      commitFinanceDelivery({ previous: saved, cursor: { owner: 2 }, records: [], tombstones: [] }),
    ).rejects.toThrow(/proof|evidence/i);
    await expect(
      commitFinanceDelivery({
        previous: saved,
        cursor: { owner: 2 },
        records: [],
        tombstones: [],
        cacheProof: 'invalid',
      }),
    ).rejects.toThrow(/proof|evidence/i);
    expect((await readFinanceDeliveryCheckpoint('u1')).cursor).toEqual({ owner: 1 });
    const renewed = await commitFinanceDelivery({
      previous: saved,
      cursor: { owner: 2 },
      records: [],
      tombstones: [],
      cacheProof: 'fc1.newnonce.new-evidence.tag',
    });
    expect(renewed.cursor).toEqual({ owner: 2 });
  });
  it('invalidates cached delivery atomically, stays closed on storage failure and retains encrypted pending work', async () => {
    await controller.unlockOnline('001234');
    state.rows.set(record.id, record);
    state.outbox.set(mutation.id, mutation);
    state.bytes.set('retained', { ciphertext: 'bytes' });
    state.conflicts.set('retained', { ciphertext: 'conflict' });
    state.settings.set('sync-cursor', { key: 'sync-cursor', value: 'ordinary' });
    await commitFinanceDelivery({
      previous: await readFinanceDeliveryCheckpoint('u1'),
      cursor: { owner: 1 },
      records: [],
      tombstones: [],
      cacheProof: 'fc1.nonce.encrypted.tag',
    });
    await expect(invalidateFinanceDeliveryCache('other')).rejects.toThrow(/another/i);
    state.beforeCommit = async () => {
      throw new Error('Synthetic storage failure');
    };
    await expect(invalidateFinanceDeliveryCache('u1')).rejects.toThrow(/storage failure/i);
    expect(controller.canRead()).toBe(false);
    expect(state.rows.get(record.id)).toEqual(record);
    expect(state.settings.has('finance-delivery:u1')).toBe(true);
    await invalidateFinanceDeliveryCache('u1');
    expect(state.rows.get(record.id)).toEqual(record);
    expect(state.settings.has('finance-delivery:u1')).toBe(false);
    expect(state.settings.get('sync-cursor')?.value).toBe('ordinary');
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    expect(state.bytes.size).toBe(1);
    expect(state.conflicts.size).toBe(1);
    await expect(controller.unlockOffline('001234')).rejects.toThrow(/connect/i);
  });
  it('revokes cache reads while preserving encrypted pending edits, conflicts and receipt bytes', async () => {
    await controller.synchronize({ requirePin: false, revision: 1, sessionEpoch: 1 });
    expect(controller.canRead()).toBe(true);
    const revoked = { ...record, scopeKey: 'GROUP#revoked' };
    state.rows.set(record.id, revoked);
    state.rows.set('server-revoked', { ...revoked, id: 'server-revoked' });
    state.rows.set('other', { ...record, id: 'other', scopeKey: 'OWNER#u1' });
    state.outbox.set(mutation.id, mutation);
    state.bytes.set(record.id, { ciphertext: 'original-pending-bytes' });
    state.conflicts.set('review', { ciphertext: 'original-conflict' });
    const before = JSON.stringify([...state.outbox]);
    state.settings.set('finance-delivery:u1', {
      key: 'finance-delivery:u1',
      value: 'synthetic obsolete proof',
    });
    await purgeFinanceScope('GROUP#revoked');
    expect(state.rows.get(record.id)).toEqual(revoked);
    expect(state.rows.has('server-revoked')).toBe(false);
    expect(state.settings.has('finance-delivery:u1')).toBe(false);
    expect(state.rows.has('other')).toBe(true);
    expect(JSON.stringify([...state.outbox])).toBe(before);
    expect(state.bytes.get(record.id)).toEqual({ ciphertext: 'original-pending-bytes' });
    expect(state.conflicts.get('review')).toEqual({ ciphertext: 'original-conflict' });
    expect(controller.canRead()).toBe(false);
    await expect(controller.unlockOffline('001234')).rejects.toThrow(/connect/i);
  });
  it.each(['financeReusableItem', 'financeBudget'] as const)(
    'atomically retires only an acknowledged %s creation draft and rolls it back on lock',
    async (entityType) => {
      await controller.unlockOnline('001234');
      const expected = { ...mutation, entityType };
      const draft = { ...record, entityType };
      state.rows.set(draft.id, draft);
      state.outbox.set(expected.id, expected);
      state.bytes.set('retained', { ciphertext: 'unrelated receipt bytes' });
      await expect(
        controller.read(async (signal) => {
          state.beforeCommit = lockAndReopen;
          await commitFinanceReplayOutcome({ expected, signal });
        }),
      ).rejects.toThrow();
      expect(state.outbox.get(expected.id)).toEqual(expected);
      expect(state.rows.get(draft.id)).toEqual(draft);
      await controller.read((signal) => commitFinanceReplayOutcome({ expected, signal }));
      expect(state.outbox.has(expected.id)).toBe(false);
      expect(state.rows.has(draft.id)).toBe(false);
      expect(state.bytes.get('retained')).toEqual({ ciphertext: 'unrelated receipt bytes' });
    },
  );
  it('retains reusable draft data for conflicts, later edits, newer drafts and verified server projections', async () => {
    await controller.unlockOnline('001234');
    for (const reason of ['conflict', 'later-edit', 'newer-draft', 'verified']) {
      state.rows.clear();
      state.outbox.clear();
      state.conflicts.clear();
      const expected = { ...mutation, entityType: 'financeReusableItem' as const };
      const draft = {
        ...record,
        entityType: 'financeReusableItem',
        ...(reason === 'newer-draft' ? { version: 2 } : {}),
        ...(reason === 'verified' ? { cacheGeneration: 'a'.repeat(36) } : {}),
      };
      state.rows.set(draft.id, draft);
      state.outbox.set(expected.id, expected);
      if (reason === 'later-edit')
        state.outbox.set('later', {
          ...expected,
          id: 'later',
          operation: 'update',
          baseVersion: 1,
        });
      const conflict = {
        id: expected.id,
        entityType: expected.entityType,
        updatedAt: record.updatedAt,
        value: record.value,
      };
      await controller.read((signal) =>
        commitFinanceReplayOutcome({
          expected,
          signal,
          ...(reason === 'conflict' ? { conflict } : {}),
        }),
      );
      expect(state.rows.get(draft.id)).toEqual(draft);
      if (reason === 'conflict') expect(state.conflicts.get(expected.id)).toEqual(conflict);
      if (reason === 'later-edit') expect(state.outbox.has('later')).toBe(true);
    }
  });
  it('rolls back a replay acknowledgement when its original visit ends during commit', async () => {
    await controller.unlockOnline('001234');
    state.outbox.set(mutation.id, mutation);
    state.bytes.set('retained', { ciphertext: 'receipt' });
    await expect(
      controller.read(async (signal) => {
        state.beforeCommit = lockAndReopen;
        await commitFinanceReplayOutcome({ expected: mutation, signal });
      }),
    ).rejects.toThrow(/abort|unlock/i);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    expect(state.bytes.get('retained')).toEqual({ ciphertext: 'receipt' });
    await controller.read((signal) => commitFinanceReplayOutcome({ expected: mutation, signal }));
    expect(state.outbox.size).toBe(0);
    expect(state.bytes.size).toBe(1);
  });
  it('atomically stores an encrypted replay conflict and rejects replaced or late intent', async () => {
    await controller.unlockOnline('001234');
    state.outbox.set(mutation.id, mutation);
    const conflict = {
      id: mutation.id,
      entityType: mutation.entityType,
      updatedAt: record.updatedAt,
      value: record.value,
    };
    await expect(
      controller.read(async (signal) => {
        state.beforeCommit = lockAndReopen;
        await commitFinanceReplayOutcome({ expected: mutation, conflict, signal });
      }),
    ).rejects.toThrow(/abort|unlock/i);
    expect(state.conflicts.size).toBe(0);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    state.outbox.set(mutation.id, { ...mutation, baseVersion: 7 });
    await expect(
      controller.read((signal) =>
        commitFinanceReplayOutcome({ expected: mutation, conflict, signal }),
      ),
    ).rejects.toThrow(/changed/i);
    expect(state.conflicts.size).toBe(0);
    state.outbox.set(mutation.id, mutation);
    await controller.read((signal) =>
      commitFinanceReplayOutcome({ expected: mutation, conflict, signal }),
    );
    expect(state.outbox.size).toBe(0);
    expect(state.conflicts.get(mutation.id)).toEqual(conflict);
  });
  it('refuses a locked hydration before opening a database transaction', async () => {
    await expect(applyFinancePull({ records: [record], tombstones: [] })).rejects.toThrow(
      /unlock/i,
    );
    expect(state.rows.size).toBe(0);
  });
  it('aborts a hydration transaction on lock even if another visit immediately unlocks', async () => {
    for (const phase of ['beforePut', 'beforeCommit'] as const) {
      await controller.unlockOnline('001234');
      state.rows.set('existing', { encrypted: 'keep', entityType: 'financeBudget' });
      state.outbox.set(mutation.id, mutation);
      state[phase] = lockAndReopen;
      await expect(
        applyFinancePull({
          records: [{ ...record, id: 'new' }],
          tombstones: [{ id: 'existing', entityType: 'financeBudget' }],
        }),
      ).rejects.toThrow();
      expect(state.abort).toHaveBeenCalled();
      expect([...state.rows]).toEqual([
        ['existing', { encrypted: 'keep', entityType: 'financeBudget' }],
      ]);
      expect(state.outbox.get(mutation.id)).toEqual(mutation);
    }
  });
  it('does not queue receipt bytes whose encryption finished after lock and a fresh unlock', async () => {
    await controller.unlockOnline('001234');
    state.beforeEncrypt = lockAndReopen;
    await expect(
      queueFinanceReceiptBytes({
        ownerId: 'u1',
        transactionId: 'transaction',
        bytes: new Uint8Array([65]),
        record,
        mutation,
      }),
    ).rejects.toThrow(/unlock/i);
    expect(state.bytes.size).toBe(0);
    expect(state.rows.size).toBe(0);
    expect(state.outbox.size).toBe(0);
  });
  it('does not queue a stale budget edit using a previously supplied encryption key', async () => {
    await controller.unlockOnline('001234');
    state.beforeEncrypt = lockAndReopen;
    await expect(
      queueEncryptedBudgetMutation({
        entityId: 'budget',
        entityType: 'financeBudget',
        budgetId: 'budget',
        scopeKey: 'GROUP#g',
        baseVersion: 1,
        value: { name: 'Retained form input' },
        key: {} as CryptoKey,
      }),
    ).rejects.toThrow(/unlock/i);
    expect(state.rows.size).toBe(0);
    expect(state.outbox.size).toBe(0);
  });
});

describe('atomic independent Finance delivery checkpoints', () => {
  it('persists snapshot continuation with each encrypted page and clears it at the captured frontier', async () => {
    await controller.unlockOnline('001234');
    const proof = 'fc1.nonce.encrypted-dependency-evidence.tag';
    const initial = await readFinanceDeliveryCheckpoint('u1');
    const partial = await commitFinanceDelivery({
      previous: initial,
      cursor: {},
      bootstrapCursor: 'fb1.next.page.tag',
      cacheProof: proof,
      records: [record],
      tombstones: [],
    });
    expect(await readFinanceDeliveryCheckpoint('u1')).toMatchObject({
      cursor: {},
      bootstrapCursor: 'fb1.next.page.tag',
      cacheProof: proof,
    });
    await commitFinanceDelivery({
      previous: partial,
      cursor: { public: 7, owner: 11 },
      cacheProof: proof,
      records: [],
      tombstones: [],
    });
    expect(await readFinanceDeliveryCheckpoint('u1')).toMatchObject({
      cursor: { public: 7, owner: 11 },
      cacheProof: proof,
    });
    expect(await readFinanceDeliveryCheckpoint('u1')).not.toHaveProperty('bootstrapCursor');
  });

  it('saves encrypted data and its checkpoint together without acknowledging ordinary tasks or replacing pending edits', async () => {
    await controller.unlockOnline('001234');
    state.settings.set('sync-cursor', { key: 'sync-cursor', value: '{"owner":99}' });
    state.rows.set(record.id, record);
    state.outbox.set(mutation.id, mutation);
    const previous = await readFinanceDeliveryCheckpoint('u1');
    expect(previous).toEqual({ ownerId: 'u1', version: 0, cursor: {} });
    await commitFinanceDelivery({
      previous,
      cursor: { owner: 3 },
      records: [
        { ...record, value: { iv: 'replace', ciphertext: 'server' } },
        { ...record, id: 'new' },
      ],
      tombstones: [{ id: record.id, entityType: 'financeReceipt' }],
    });
    expect(state.rows.get(record.id)).toEqual(record);
    expect(state.rows.has('new')).toBe(true);
    expect(state.outbox.get(mutation.id)).toEqual(mutation);
    expect(await readFinanceDeliveryCheckpoint('u1')).toMatchObject({
      ownerId: 'u1',
      version: 1,
      cursor: { owner: 3 },
    });
    expect(state.settings.get('sync-cursor')?.value).toBe('{"owner":99}');
  });
  it('rejects a competing tab checkpoint without retaining any of its downloaded data', async () => {
    await controller.unlockOnline('001234');
    const previous = await readFinanceDeliveryCheckpoint('u1');
    await commitFinanceDelivery({ previous, cursor: { owner: 5 }, records: [], tombstones: [] });
    await expect(
      commitFinanceDelivery({ previous, cursor: { owner: 3 }, records: [record], tombstones: [] }),
    ).rejects.toThrow(/another tab/i);
    expect(state.rows.size).toBe(0);
    expect(await readFinanceDeliveryCheckpoint('u1')).toMatchObject({
      version: 1,
      cursor: { owner: 5 },
    });
  });
  it('rolls back the independent cursor and delivered rows when Finance locks before commit', async () => {
    await controller.unlockOnline('001234');
    const previous = await readFinanceDeliveryCheckpoint('u1');
    state.beforeCommit = lockAndReopen;
    await expect(
      commitFinanceDelivery({ previous, cursor: { owner: 8 }, records: [record], tombstones: [] }),
    ).rejects.toThrow();
    expect(state.rows.size).toBe(0);
    expect(await readFinanceDeliveryCheckpoint('u1')).toEqual(previous);
    expect(state.abort).toHaveBeenCalled();
  });
  it('rejects foreign owners, malformed/backward cursors and a response from a previous visit', async () => {
    await controller.unlockOnline('001234');
    await expect(readFinanceDeliveryCheckpoint('other')).rejects.toThrow(/another account/i);
    const previous = await readFinanceDeliveryCheckpoint('u1');
    await expect(
      commitFinanceDelivery({
        previous: { ...previous, ownerId: 'other' },
        cursor: {},
        records: [record],
        tombstones: [],
      }),
    ).rejects.toThrow(/another account/i);
    await expect(
      commitFinanceDelivery({ previous, cursor: { owner: -1 }, records: [record], tombstones: [] }),
    ).rejects.toThrow(/checkpoint/i);
    const current = await commitFinanceDelivery({
      previous,
      cursor: { owner: 5 },
      records: [],
      tombstones: [],
    });
    await expect(
      commitFinanceDelivery({
        previous: current,
        cursor: { owner: 4 },
        records: [record],
        tombstones: [],
      }),
    ).rejects.toThrow(/checkpoint/i);
    const abort = new AbortController();
    abort.abort();
    await expect(
      commitFinanceDelivery({
        previous: current,
        cursor: { owner: 6 },
        records: [record],
        tombstones: [],
        signal: abort.signal,
      }),
    ).rejects.toThrow(/unlock/i);
    state.beforeEncrypt = lockAndReopen;
    await expect(
      commitFinanceDelivery({
        previous: current,
        cursor: { owner: 6 },
        records: [record],
        tombstones: [],
      }),
    ).rejects.toThrow(/unlock/i);
    expect(await readFinanceDeliveryCheckpoint('u1')).toEqual(current);
    controller.lock(false);
    await controller.unlockOffline('001234');
    await expect(
      commitFinanceDelivery({
        previous: current,
        cursor: { owner: 6 },
        records: [record],
        tombstones: [],
      }),
    ).rejects.toThrow(/connect and unlock/i);
    expect(state.rows.size).toBe(0);
  });
});
