import { describe, expect, it } from 'vitest';
import {
  FinanceBudgetAccountLinkIndexVerifier,
  financeBudgetAccountPairKey,
} from '../../apps/api/src/finance/budget-account-link-index.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

const PK = 'FINANCE#SCOPE#GROUP#01J00000000000000000000201';
const budgetId = '01J00000000000000000000202';
const accountId = '01J00000000000000000000203';
const link = (id: string, status: 'active' | 'removed' = 'active') => ({
  id,
  budgetId,
  accountId,
  audience: { type: 'group' as const, groupId: '01J00000000000000000000201' },
  status,
  createdBy: 'member-a',
  version: status === 'active' ? 1 : 2,
});

function setup(rows: ReturnType<typeof link>[]) {
  const f = financePersistenceFixture();
  const meta = { PK, SK: 'META' };
  f.rows.set(f.key(meta), { ...meta, revision: 4 });
  const source = rows.map((data, index) => ({
    PK,
    SK: `ROW#budgetAccountLinks#${String(index).padStart(2, '0')}`,
    collection: 'budgetAccountLinks' as const,
    entryKey: data.id,
    data,
  }));
  for (const row of source) f.rows.set(f.key(row), structuredClone(row));
  const verifier = new FinanceBudgetAccountLinkIndexVerifier({
    work: () => new FinanceUnitOfWork(f.persistence, 'table'),
    pageSize: 10,
    readPage: async () => ({ rows: structuredClone(source) }),
  });
  return { ...f, meta, source, verifier };
}

describe('budget/account active-link singleton backfill', () => {
  it('writes only active pair locators and stamps coverage after the bounded page', async () => {
    const active = link('01J00000000000000000000204');
    const removed = link('01J00000000000000000000205', 'removed');
    const f = setup([active, removed]);
    await expect(f.verifier.step(PK)).resolves.toEqual({ complete: true, examined: 2 });
    expect(f.rows.get(f.key(financeBudgetAccountPairKey(budgetId, accountId)))).toMatchObject({
      linkId: active.id,
      storageKey: { PK, SK: f.source[0]!.SK },
    });
    expect(f.rows.get(f.key(f.meta))).toMatchObject({
      revision: 5,
      budgetAccountLinkIndexVersion: 1,
    });
  });

  it('stops on duplicate active pairs without stamping false coverage', async () => {
    const f = setup([link('01J00000000000000000000204'), link('01J00000000000000000000205')]);
    await expect(f.verifier.step(PK)).rejects.toThrow(/Duplicate active/i);
    expect(f.rows.get(f.key(f.meta))?.budgetAccountLinkIndexVersion).toBeUndefined();
  });

  it('cleans a matching partial locator when its source link was removed before restart', async () => {
    const removed = link('01J00000000000000000000205', 'removed');
    const f = setup([removed]);
    const key = financeBudgetAccountPairKey(budgetId, accountId);
    f.rows.set(f.key(key), {
      ...key,
      linkId: removed.id,
      storageKey: { PK, SK: f.source[0]!.SK },
    });
    await expect(f.verifier.step(PK)).resolves.toMatchObject({ complete: true });
    expect(f.rows.has(f.key(key))).toBe(false);
  });

  it('rejects an unsupported coverage version without reading a page', async () => {
    const f = setup([]);
    f.rows.set(f.key(f.meta), {
      ...f.rows.get(f.key(f.meta)),
      budgetAccountLinkIndexVersion: 2,
    });
    await expect(f.verifier.step(PK)).rejects.toThrow(/Unsupported/i);
  });
});
