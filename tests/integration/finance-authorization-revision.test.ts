import { describe, expect, it } from 'vitest';
import {
  financeAuthorizationPartitions,
  nextFinanceAuthorizationRevision,
} from '../../apps/api/src/finance/authorization-revision.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
const owner = 'FINANCE#SCOPE#OWNER#owner';
const group = 'FINANCE#SCOPE#GROUP#shared';
const row = (collection: string, id: string, data: Record<string, unknown>, PK = owner) => ({
  PK,
  SK: `ROW#${collection}#${id}`,
  collection,
  entryKey: id,
  data: { id, version: 1, ...data },
});

describe('canonical Finance permission-change revisions', () => {
  it('persists catalogue withdrawal authority atomically through the targeted writer', async () => {
    const f = financePersistenceFixture(),
      PK = 'FINANCE#CATALOG';
    const category = row('categories', 'category', { name: 'Delete me' }, PK);
    const meta = { PK, SK: 'META', revision: 1 };
    for (const value of [category, meta]) f.rows.set(f.key(value), value);
    const work = new FinanceUnitOfWork(f.persistence, 'table');
    await work.delete(category);
    await work.put({ ...meta, revision: 2 });
    await work.commit({
      key: { PK: 'TEST', SK: 'CATALOG' },
      fingerprint: 'delete-category',
      result: true,
      expiresAt: 2000000000,
    });
    expect(f.rows.has(f.key(category))).toBe(false);
    expect(f.rows.get(f.key(meta))).toMatchObject({ revision: 2, financeAuthorizationRevision: 1 });
  });
  it('does not invalidate existing cache authority for new sources or ordinary amount/date/correction writes', () => {
    const before = row('transactions', 'transaction', { accountId: 'account', amountMinor: -100 });
    expect([...financeAuthorizationPartitions([{ after: before }])]).toEqual([]);
    expect([
      ...financeAuthorizationPartitions([
        {
          before,
          after: {
            ...before,
            SK: 'ROW#transactions#new-date',
            data: {
              ...before.data,
              amountMinor: -200,
              version: 2,
              effectiveAt: '2026-11-07T00:00:00Z',
            },
          },
        },
      ]),
    ]).toEqual([]);
  });
  it('invalidates both sides of a scope move and the source of physical removal', () => {
    const before = row('accounts', 'account', { scope: { type: 'owner', ownerId: 'owner' } });
    const after = row(
      'accounts',
      'account',
      { scope: { type: 'group', groupId: 'shared' }, version: 2 },
      group,
    );
    expect([...financeAuthorizationPartitions([{ before }, { after }])].sort()).toEqual(
      [group, owner].sort(),
    );
    expect([
      ...financeAuthorizationPartitions([
        { before: row('transactions', 'transaction', { accountId: 'account' }) },
      ]),
    ]).toEqual([owner]);
  });
  it('tracks permission-defining parent changes and withdrawals without treating routine status/amount changes as revocations', () => {
    const before = row('upcomingExpenses', 'expense', {
      accountId: 'a',
      budgetId: 'budget',
      amountMinor: 100,
      status: 'unpaid',
    });
    expect([
      ...financeAuthorizationPartitions([
        { before, after: { ...before, data: { ...before.data, accountId: 'b' } } },
      ]),
    ]).toEqual([owner]);
    expect([
      ...financeAuthorizationPartitions([
        {
          before,
          after: { ...before, data: { ...before.data, amountMinor: 200, status: 'paid' } },
        },
      ]),
    ]).toEqual([]);
    const link = row('financialTaskLinks', 'link', {
      taskId: 'task',
      budgetItemId: 'item',
      status: 'active',
    });
    expect([
      ...financeAuthorizationPartitions([
        { before: link, after: { ...link, data: { ...link.data, status: 'removed' } } },
      ]),
    ]).toEqual([owner]);
    const history = {
      ...row('budgetReconciliations', 'history', { budgetId: 'budget' }),
      financeSourceAccountIds: ['a'],
    };
    expect([
      ...financeAuthorizationPartitions([
        { before: history, after: { ...history, financeSourceAccountIds: ['b'] } },
      ]),
    ]).toEqual([owner]);
    const preference = row('dashboardPreferences', 'preference', { ownerId: 'owner' });
    expect([
      ...financeAuthorizationPartitions([
        {
          before: preference,
          after: { ...preference, data: { ...preference.data, ownerId: 'other' } },
        },
      ]),
    ]).toEqual([owner]);
  });
  it('ignores bookkeeping and ordinary catalogue edits but invalidates catalogue withdrawals', () => {
    expect([
      ...financeAuthorizationPartitions([
        { before: row('importJobs', 'job', { status: 'running' }) },
      ]),
    ]).toEqual([]);
    const category = row('categories', 'category', { name: 'Old name' }, 'FINANCE#CATALOG');
    expect([
      ...financeAuthorizationPartitions([
        {
          before: category,
          after: { ...category, data: { ...category.data, name: 'New name', version: 2 } },
        },
      ]),
    ]).toEqual([]);
    expect([...financeAuthorizationPartitions([{ before: category }])]).toEqual([
      'FINANCE#CATALOG',
    ]);
    expect([
      ...financeAuthorizationPartitions([
        { before: category, after: { ...category, data: { ...category.data, status: 'removed' } } },
      ]),
    ]).toEqual(['FINANCE#CATALOG']);
    expect(nextFinanceAuthorizationRevision(undefined, true)).toBe(1);
    expect(nextFinanceAuthorizationRevision(7, false)).toBe(7);
    for (const value of [-1, 1.5, NaN, Number.MAX_SAFE_INTEGER])
      expect(() => nextFinanceAuthorizationRevision(value, true)).toThrow(/revision/i);
  });
  it('atomically advances permission metadata on a canonical move and preserves it across ordinary writes', async () => {
    const f = financePersistenceFixture();
    const before = row('accounts', 'account', { scope: { type: 'owner', ownerId: 'owner' } });
    for (const value of [
      before,
      {
        PK: owner,
        SK: 'META',
        revision: 1,
        financeAuthorizationRevision: 4,
        retainedMarker: 'keep',
      },
      { PK: group, SK: 'META', revision: 1 },
    ])
      f.rows.set(f.key(value), value);
    const work = new FinanceUnitOfWork(f.persistence, 'table');
    await work.delete(before);
    await work.put(
      row(
        'accounts',
        'account',
        { scope: { type: 'group', groupId: 'shared' }, version: 2 },
        group,
      ),
    );
    for (const PK of [owner, group])
      await work.put({ ...(await work.get({ PK, SK: 'META' }))!, revision: 2 });
    await work.commit({
      key: { PK: 'TEST', SK: 'MOVE' },
      fingerprint: 'move',
      result: true,
      expiresAt: 2000000000,
    });
    expect(f.rows.get(f.key({ PK: owner, SK: 'META' }))).toMatchObject({
      revision: 2,
      financeAuthorizationRevision: 5,
      retainedMarker: 'keep',
    });
    expect(f.rows.get(f.key({ PK: group, SK: 'META' }))).toMatchObject({
      revision: 2,
      financeAuthorizationRevision: 1,
    });
    const next = new FinanceUnitOfWork(f.persistence, 'table');
    await next.put(
      row('transactions', 'transaction', { accountId: 'account', amountMinor: -100 }, group),
    );
    // An older caller omitting new private metadata must not reset the counter.
    await next.put({ PK: group, SK: 'META', revision: 3 });
    await next.commit({
      key: { PK: 'TEST', SK: 'CREATE' },
      fingerprint: 'create',
      result: true,
      expiresAt: 2000000000,
    });
    expect(f.rows.get(f.key({ PK: group, SK: 'META' }))).toMatchObject({
      revision: 3,
      financeAuthorizationRevision: 1,
    });
    const metadata = new FinanceUnitOfWork(f.persistence, 'table');
    await metadata.put({
      PK: group,
      SK: 'META',
      revision: 3,
      financeAuthorizationRevision: 0,
      privateBookkeeping: true,
    });
    await metadata.commit({
      key: { PK: 'TEST', SK: 'BOOKKEEPING' },
      fingerprint: 'bookkeeping',
      result: true,
      expiresAt: 2000000000,
    });
    expect(f.rows.get(f.key({ PK: group, SK: 'META' }))).toMatchObject({
      financeAuthorizationRevision: 1,
      privateBookkeeping: true,
    });
  });
});
