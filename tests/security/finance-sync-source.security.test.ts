import { describe, expect, it, vi } from 'vitest';
import {
  FinanceSyncSourceGuard,
  serializeFinanceFeedChange,
  assertFinanceTaskResultAccess,
} from '../../apps/api/src/finance/sync-source-guard.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import type { SyncChange } from '@naaseh/domain';

function setup() {
  const f = financePersistenceFixture();
  const PK = 'FINANCE#SCOPE#OWNER#owner';
  const group = 'FINANCE#SCOPE#GROUP#shared';
  let member = true;
  let taskVisible = true;
  const add = (collection: string, id: string, data: Record<string, unknown>, partition = PK) => {
    const key = { PK: partition, SK: `ROW#${collection}#${id}` };
    f.rows.set(f.key(key), { ...key, collection, entryKey: id, data: { id, version: 1, ...data } });
    f.rows.set(f.key(financeLocatorKey(collection, id)), {
      ...financeLocatorKey(collection, id),
      storageKey: key,
    });
    f.rows.set(f.key({ PK: partition, SK: 'META' }), { PK: partition, SK: 'META', revision: 1 });
    return f.rows.get(f.key(key))!.data as Record<string, unknown>;
  };
  const account = add('accounts', 'account', {
    scope: { type: 'owner', ownerId: 'owner' },
    status: 'active',
  });
  const transaction = add('transactions', 'transaction', {
    accountId: 'account',
    amountMinor: -100,
    status: 'active',
  });
  const feed = (
    entityType: SyncChange['entityType'],
    payload: Record<string, unknown>,
    audience = 'OWNER#owner',
  ): SyncChange => ({
    audience,
    sequence: 1,
    entityType,
    entityId: String(payload.id),
    version: 1,
    changedAt: '2026-11-07T00:00:00Z',
    operation: 'upsert',
    payload,
  });
  const guard = (role: 'user' | 'admin' = 'user') =>
    new FinanceSyncSourceGuard({
      userId: 'owner',
      role,
      work: () => new FinanceUnitOfWork(f.persistence, 'table'),
      membership: async (groupId, userId) =>
        member ? { groupId, userId, role: 'member', status: 'active', version: 1 } : undefined,
      task: async () =>
        taskVisible
          ? { ownerId: 'owner', visibility: 'private', version: 1 }
          : { ownerId: 'other', visibility: 'private', version: 2 },
    });
  return {
    ...f,
    PK,
    group,
    add,
    account,
    transaction,
    feed,
    guard,
    revoke: () => {
      member = false;
    },
    hideTask: () => {
      taskVisible = false;
    },
  };
}
describe('canonical Finance synchronization source boundary', () => {
  it('releases only a currently authorized canonical snapshot and rejects stale feed bodies', async () => {
    const f = setup(),
      guard = f.guard();
    expect(await guard.canDeliver(f.feed('financeTransaction', f.transaction))).toBe(true);
    expect(
      await guard.canDeliver(f.feed('financeTransaction', { ...f.transaction, amountMinor: -999 })),
    ).toBe(false);
    await guard.assertCurrent();
    const originalGet = f.persistence.get;
    let raced = false;
    f.persistence.get = async (key) => {
      const value = await originalGet(key);
      if (!raced && key.SK === 'ROW#transactions#transaction') {
        raced = true;
        f.rows.set(f.key(key), {
          ...value!,
          data: { ...f.transaction, amountMinor: -200, version: 2 },
        });
        f.rows.set(f.key({ PK: f.PK, SK: 'META' }), { PK: f.PK, SK: 'META', revision: 2 });
      }
      return value;
    };
    const concurrent = f.guard();
    expect(await concurrent.canDeliver(f.feed('financeTransaction', f.transaction))).toBe(true);
    await expect(concurrent.assertCurrent()).rejects.toThrow(/changed/i);
  });
  it('withholds an old audience snapshot after its account is reassigned or removed', async () => {
    const f = setup();
    f.add(
      'accounts',
      'account',
      { scope: { type: 'owner', ownerId: 'other' }, status: 'active', version: 2 },
      'FINANCE#SCOPE#OWNER#other',
    );
    expect(await f.guard().canDeliver(f.feed('financeTransaction', f.transaction))).toBe(false);
    f.rows.delete(f.key(financeLocatorKey('accounts', 'account')));
    expect(await f.guard().canDeliver(f.feed('financeTransaction', f.transaction))).toBe(false);
  });
  it('requires both budget/group and private account access on a relationship', async () => {
    const f = setup();
    f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    const link = f.add(
      'budgetAccountLinks',
      'link',
      { budgetId: 'budget', accountId: 'account', status: 'active' },
      f.group,
    );
    expect(
      await f.guard().canDeliver(f.feed('financeBudgetAccountLink', link, 'OWNER#owner')),
    ).toBe(true);
    f.add(
      'budgetItems',
      'item',
      { budgetId: 'budget', relatedAccountIds: ['account'], status: 'active' },
      f.group,
    );
    const allocated = f.add('transactions', 'transaction', {
      ...f.transaction,
      allocations: [{ budgetItemId: 'item' }],
    });
    expect(await f.guard().canDeliver(f.feed('financeTransaction', allocated))).toBe(true);
    f.revoke();
    expect(await f.guard().canDeliver(f.feed('financeTransaction', allocated))).toBe(false);
    expect(
      await f.guard().canDeliver(f.feed('financeBudgetAccountLink', link, 'OWNER#owner')),
    ).toBe(false);
  });
  it('requires task visibility as well as financial source access and rechecks it at delivery', async () => {
    const f = setup();
    f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    f.add(
      'budgetItems',
      'item',
      { budgetId: 'budget', relatedAccountIds: ['account'], status: 'active' },
      f.group,
    );
    const link = f.add(
      'financialTaskLinks',
      'task-link',
      { budgetId: 'budget', budgetItemId: 'item', taskId: 'task', status: 'active' },
      f.group,
    );
    const change = f.feed('financeTaskLink', link, 'GROUP#shared'),
      guard = f.guard();
    expect(await guard.canDeliver(change)).toBe(true);
    f.hideTask();
    await expect(guard.assertCurrent()).rejects.toThrow(/changed/i);
    expect(await f.guard().canDeliver(change)).toBe(false);
  });
  it('withholds reconciliation aggregates without private complete source evidence and strips that evidence from wire output', async () => {
    const f = setup();
    f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    const record = f.add(
      'budgetReconciliations',
      'reconciliation',
      { budgetId: 'budget', totalsByCurrency: [{ amountMinor: 100 }] },
      f.group,
    );
    const change = f.feed('financeReconciliation', record, 'GROUP#shared');
    expect(await f.guard().canDeliver(change)).toBe(false);
    f.rows.get(
      f.key({ PK: f.group, SK: 'ROW#budgetReconciliations#reconciliation' }),
    )!.financeSourceAccountIds = ['account'];
    expect(await f.guard().canDeliver(change)).toBe(true);
    const proven = { ...change, financeDelivery: { format: 1, accountIds: [] } };
    expect(await f.guard().canDeliver(proven)).toBe(true);
    expect(serializeFinanceFeedChange(proven)).toEqual(change);
    f.add(
      'accounts',
      'account',
      { scope: { type: 'owner', ownerId: 'other' }, status: 'active' },
      'FINANCE#SCOPE#OWNER#other',
    );
    expect(await f.guard().canDeliver(proven)).toBe(false);
  });
  it('admits administrator owner/member sources without reading foreign scope bodies', async () => {
    const f = setup(),
      guard = f.guard('admin');
    expect(await guard.canDeliver(f.feed('financeTransaction', f.transaction))).toBe(true);
    const budget = f.add(
      'budgets',
      'admin-budget',
      { groupId: 'shared', status: 'active' },
      f.group,
    );
    expect(await guard.canDeliver(f.feed('financeBudget', budget, 'GROUP#shared'))).toBe(true);
    await expect(guard.cacheAuthorizationSnapshot()).resolves.toMatchObject({ userId: 'owner' });
    const foreign = f.add(
      'accounts',
      'foreign',
      { scope: { type: 'owner', ownerId: 'other' }, status: 'active' },
      'FINANCE#SCOPE#OWNER#other',
    );
    const read = vi.spyOn(f.persistence, 'get');
    expect(
      await f.guard('admin').canDeliver(f.feed('financeAccount', foreign, 'OWNER#other')),
    ).toBe(false);
    expect(read.mock.calls.some(([key]) => key.PK === 'FINANCE#SCOPE#OWNER#other')).toBe(false);
    f.revoke();
    await expect(guard.assertCurrent()).rejects.toThrow(/changed/i);
    expect(await f.guard('admin').canDeliver(f.feed('financeBudget', budget, 'GROUP#shared'))).toBe(
      false,
    );
  });
  it('does not apply the administrator private-task override to Finance sources or REST results', async () => {
    const f = setup();
    f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    f.add(
      'budgetItems',
      'item',
      { budgetId: 'budget', relatedAccountIds: [], status: 'active' },
      f.group,
    );
    const link = f.add(
      'financialTaskLinks',
      'link',
      { budgetId: 'budget', budgetItemId: 'item', taskId: 'task', status: 'active' },
      f.group,
    );
    expect(await f.guard('admin').canDeliver(f.feed('financeTaskLink', link, 'GROUP#shared'))).toBe(
      true,
    );
    f.hideTask();
    expect(await f.guard('admin').canDeliver(f.feed('financeTaskLink', link, 'GROUP#shared'))).toBe(
      false,
    );
    const send = vi
      .spyOn(dynamodb, 'send')
      .mockResolvedValue({
        Item: { data: { ownerId: 'owner', visibility: 'private', version: 1 } },
      } as never);
    try {
      await expect(
        assertFinanceTaskResultAccess(link, { id: 'owner', role: 'admin', active: true }),
      ).resolves.toHaveLength(1);
      send.mockResolvedValue({
        Item: { data: { ownerId: 'other', visibility: 'private', version: 1 } },
      } as never);
      await expect(
        assertFinanceTaskResultAccess(link, { id: 'owner', role: 'admin', active: true }),
      ).rejects.toThrow(/task access changed/i);
    } finally {
      send.mockRestore();
    }
  });
  it('denies unknown/missing sources and fails closed if scope or membership changes after preparation', async () => {
    const f = setup();
    expect(await f.guard('admin').canDeliver(f.feed('financeTransaction', f.transaction))).toBe(
      true,
    );
    expect(await f.guard().canDeliver(f.feed('financeReceipt', { id: 'unbuilt' }))).toBe(false);
    const guard = f.guard();
    expect(await guard.canDeliver(f.feed('financeTransaction', f.transaction))).toBe(true);
    f.rows.set(f.key({ PK: f.PK, SK: 'META' }), { PK: f.PK, SK: 'META', revision: 2 });
    await expect(guard.assertCurrent()).rejects.toThrow(/changed/i);
    const budget = f.add('budgets', 'budget', { groupId: 'shared', status: 'active' }, f.group);
    const groupGuard = f.guard();
    expect(await groupGuard.canDeliver(f.feed('financeBudget', budget, 'GROUP#shared'))).toBe(true);
    f.revoke();
    await expect(groupGuard.assertCurrent()).rejects.toThrow(/changed/i);
    expect(
      serializeFinanceFeedChange({
        ...f.feed('financeTransaction', f.transaction),
        operation: 'tombstone',
        financeDelivery: { format: 1, accountIds: ['account'] },
      }),
    ).not.toHaveProperty('payload');
    const send = vi.spyOn(dynamodb, 'send').mockImplementation(async () => {
      throw new Error('Unexpected task lookup');
    });
    try {
      await expect(
        assertFinanceTaskResultAccess(
          { providerSnapshot: { taskId: 'provider-field' } },
          { id: 'owner', role: 'user', active: true },
        ),
      ).resolves.toEqual([]);
      expect(send).not.toHaveBeenCalled();
    } finally {
      send.mockRestore();
    }
  });
});
