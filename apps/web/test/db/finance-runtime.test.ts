import { loadLocalFinanceBudgets } from '../../src/sync/finance-local.js';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const state = vi.hoisted(() => ({
  records: new Map<string, unknown>(),
  pending: new Map<string, { id: string; entityId: string; entityType: string }>(),
  keys: new Map<string, unknown>(),
  settings: new Map<string, unknown>(),
}));
vi.mock('../../src/db/database.js', () => ({
  db: {
    transaction: async (...args: unknown[]) => (args.at(-1) as () => Promise<unknown>)(),
    cryptoKeys: {
      get: async (id: string) => state.keys.get(id),
      add: async (value: { id: string }) => state.keys.set(value.id, value),
    },
    secureFinanceRecords: {
      get: async (id: string) => state.records.get(id),
      toArray: async () => [...state.records.values()],
      put: async (value: { id: string }) => state.records.set(value.id, value),
      delete: async (id: string) => state.records.delete(id),
      clear: async () => state.records.clear(),
    },
    outbox: {
      add: async (value: { id: string; entityId: string; entityType: string }) =>
        state.pending.set(value.id, value),
      toArray: async () => [...state.pending.values()],
      where: () => ({
        equals: (id: string) => ({
          delete: async () => {
            for (const [key, value] of state.pending)
              if (value.entityId === id) state.pending.delete(key);
          },
        }),
      }),
      filter: (predicate: (value: { entityType: string }) => boolean) => ({
        delete: async () => {
          for (const [key, value] of state.pending) if (predicate(value)) state.pending.delete(key);
        },
      }),
    },
    secureConflicts: { toArray: async () => [], delete: async () => undefined },
    settings: {
      delete: async (key: string) => state.settings.delete(key),
      get: async (key: string) => state.settings.get(key),
      put: async (value: { key: string }) => state.settings.set(value.key, value),
    },
  },
}));
import { pullFinanceSnapshot } from '../../src/sync/finance-runtime.js';
import {
  financeDeviceKey,
  encryptFinanceRecord,
  decryptFinanceRecord,
  queueEncryptedBudgetMutation,
} from '../../src/db/finance-repository.js';
import type { EncryptedFinanceRecord } from '../../src/db/database.js';
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  state.records.clear();
  state.pending.clear();
  state.keys.clear();
  state.settings.clear();
});
afterEach(() => vi.unstubAllGlobals());
const record = (id: string) => ({
  id,
  entityType: 'financeAccount',
  scopeKey: 'OWNER#owner',
  version: 1,
  value: { id, friendlyName: 'Checking', scope: { type: 'owner', ownerId: 'owner' } },
});
const response = (
  records: unknown[],
  nextCursor: string | null = null,
  digest = 'digest',
  scopes = ['OWNER#owner'],
) => new Response(JSON.stringify({ records, nextCursor, digest, scopes }), { status: 200 });
it('hydrates a server projection as encrypted device data', async () => {
  await pullFinanceSnapshot(async () => response([record('account')]));
  const stored = state.records.get('account') as EncryptedFinanceRecord;
  expect(JSON.stringify(stored)).not.toContain('Checking');
  await pullFinanceSnapshot(async () => new Response(null, { status: 304 }));
  expect(state.records.get('account')).toBe(stored);
  expect(await decryptFinanceRecord(stored, await financeDeviceKey())).toMatchObject({
    friendlyName: 'Checking',
  });
});
it('collects every page before replacing the local snapshot', async () => {
  let call = 0;
  await pullFinanceSnapshot(async () =>
    ++call === 1 ? response([record('a')], 'next') : response([record('b')]),
  );
  expect(state.records.size).toBe(2);
  expect(call).toBe(2);
});
it('does not apply an inconsistent multi-page snapshot', async () => {
  let call = 0;
  await expect(
    pullFinanceSnapshot(async () =>
      ++call === 1 ? response([record('a')], 'next') : response([record('b')], null, 'changed'),
    ),
  ).rejects.toThrow(/changed/);
  expect(state.records.size).toBe(0);
});
it('preserves a pending authorized edit until its receipt is acknowledged', async () => {
  const key = await financeDeviceKey();
  state.records.set(
    'account',
    await encryptFinanceRecord({
      ...record('account'),
      updatedAt: new Date().toISOString(),
      value: { id: 'account', friendlyName: 'Pending name' },
      key,
    }),
  );
  state.pending.set('mutation', {
    id: 'mutation',
    entityId: 'account',
    entityType: 'financeAccount',
  });
  await pullFinanceSnapshot(async () => response([record('account')]));
  expect(
    await decryptFinanceRecord(state.records.get('account') as EncryptedFinanceRecord, key),
  ).toMatchObject({ friendlyName: 'Pending name' });
  expect(state.pending.size).toBe(1);
});
it('purges revoked group projections and dependent pending changes', async () => {
  const key = await financeDeviceKey();
  state.records.set(
    'private',
    await encryptFinanceRecord({
      id: 'private',
      entityType: 'financeBudgetItem',
      scopeKey: 'GROUP#revoked',
      version: 1,
      updatedAt: new Date().toISOString(),
      value: { description: 'Protected' },
      key,
    }),
  );
  state.pending.set('mutation', {
    id: 'mutation',
    entityId: 'private',
    entityType: 'financeBudgetItem',
  });
  await pullFinanceSnapshot(async () => response([]));
  expect(state.records.size).toBe(0);
  expect(state.pending.size).toBe(0);
});
it('clears protected state after session authorization is rejected', async () => {
  state.records.set('old', { id: 'old' });
  state.pending.set('mutation', { id: 'mutation', entityId: 'old', entityType: 'financeBudget' });
  await expect(
    pullFinanceSnapshot(async () => new Response('{}', { status: 401 })),
  ).rejects.toThrow(/synchronization/);
  expect(state.records.size).toBe(0);
  expect(state.pending.size).toBe(0);
});

it('persists budget version progress with queued children across offline reopen', async () => {
  const key = await financeDeviceKey();
  const parent = await encryptFinanceRecord({
    id: 'budget',
    entityType: 'financeBudget',
    scopeKey: 'GROUP#group',
    version: 3,
    updatedAt: 'now',
    value: { id: 'budget', version: 3 },
    key,
  });
  state.records.set(parent.id, parent);
  await queueEncryptedBudgetMutation({
    entityId: 'first',
    entityType: 'financeBudgetItem',
    budgetId: 'budget',
    scopeKey: 'GROUP#group',
    baseVersion: 3,
    value: { id: 'first', budgetId: 'budget' },
    key,
  });
  const reopened = await loadLocalFinanceBudgets();
  expect(reopened.budgets[0]?.version).toBe(4);
  await queueEncryptedBudgetMutation({
    entityId: 'second',
    entityType: 'financeBudgetItem',
    budgetId: 'budget',
    scopeKey: 'GROUP#group',
    baseVersion: 4,
    value: { id: 'second', budgetId: 'budget' },
    key,
  });
  expect((await loadLocalFinanceBudgets()).budgets[0]?.version).toBe(5);
  expect(
    [...state.pending.values()].map(
      (row) => (row as unknown as { baseVersion: number }).baseVersion,
    ),
  ).toEqual([3, 4]);
});
it('preserves a parent optimistic version while its child remains pending', async () => {
  const key = await financeDeviceKey();
  for (const value of [
    { id: 'budget', entityType: 'financeBudget', version: 4, value: { id: 'budget', version: 4 } },
    {
      id: 'child',
      entityType: 'financeBudgetItem',
      version: 1,
      value: { id: 'child', budgetId: 'budget', relatedAccountIds: [] },
    },
  ])
    state.records.set(
      value.id,
      await encryptFinanceRecord({
        ...value,
        scopeKey: 'GROUP#group',
        budgetId: 'budget',
        updatedAt: 'now',
        key,
      }),
    );
  state.pending.set('pending', {
    id: 'pending',
    entityId: 'child',
    entityType: 'financeBudgetItem',
  });
  await pullFinanceSnapshot(async () =>
    response(
      [
        {
          id: 'budget',
          entityType: 'financeBudget',
          scopeKey: 'GROUP#group',
          version: 3,
          value: { id: 'budget', version: 3 },
        },
      ],
      null,
      'digest',
      ['GROUP#group'],
    ),
  );
  expect((state.records.get('budget') as EncryptedFinanceRecord).version).toBe(4);
});

it('refreshes a rejected optimistic creation and its parent after a protected snapshot', async () => {
  const key = await financeDeviceKey();
  for (const row of [
    { id: 'budget', entityType: 'financeBudget', version: 4, value: { id: 'budget', version: 4 } },
    {
      id: 'child',
      entityType: 'financeBudgetItem',
      version: 1,
      value: { id: 'child', budgetId: 'budget', relatedAccountIds: [] },
    },
  ])
    state.records.set(
      row.id,
      await encryptFinanceRecord({
        ...row,
        scopeKey: 'GROUP#group',
        budgetId: 'budget',
        updatedAt: 'now',
        key,
      }),
    );
  state.pending.set('pending', {
    id: 'pending',
    entityId: 'child',
    entityType: 'financeBudgetItem',
  });
  const canonical = () =>
    new Response(
      JSON.stringify({
        records: [
          {
            id: 'budget',
            entityType: 'financeBudget',
            scopeKey: 'GROUP#group',
            version: 3,
            value: { id: 'budget', version: 3 },
          },
        ],
        scopes: ['GROUP#group'],
        digest: 'unchanged',
        token: 'T',
        nextCursor: null,
      }),
    );
  await pullFinanceSnapshot(async () => canonical());
  expect(state.settings.has('finance-snapshot-token')).toBe(false);
  state.pending.clear();
  await pullFinanceSnapshot(async (url) => {
    expect(String(url)).not.toContain('known=');
    return canonical();
  });
  expect(state.records.has('child')).toBe(false);
  expect((state.records.get('budget') as EncryptedFinanceRecord).version).toBe(3);
});
it('replaces a rejected optimistic update with the canonical record despite an unchanged server epoch', async () => {
  const key = await financeDeviceKey();
  state.records.set(
    'account',
    await encryptFinanceRecord({
      id: 'account',
      entityType: 'financeAccount',
      scopeKey: 'OWNER#owner',
      version: 2,
      updatedAt: 'now',
      value: { id: 'account', friendlyName: 'Rejected local name' },
      key,
    }),
  );
  state.pending.set('pending', {
    id: 'pending',
    entityId: 'account',
    entityType: 'financeAccount',
  });
  const canonical = () =>
    new Response(
      JSON.stringify({
        records: [record('account')],
        scopes: ['OWNER#owner'],
        digest: 'unchanged',
        token: 'T',
        nextCursor: null,
      }),
    );
  await pullFinanceSnapshot(async () => canonical());
  state.pending.clear();
  await pullFinanceSnapshot(async (url) => {
    expect(String(url)).not.toContain('known=');
    return canonical();
  });
  expect(
    await decryptFinanceRecord(state.records.get('account') as EncryptedFinanceRecord, key),
  ).toMatchObject({ friendlyName: 'Checking' });
});
