import { describe, expect, it } from 'vitest';
import {
  canonicalBudgetReconciliationSource,
  createBudgetReconciliation,
  digestBudgetReconciliationSource,
  markBudgetChangedSinceReconciliation,
  markBudgetReconciled,
} from './budget-reconciliation.js';
import { createBudget } from './budget.js';

const ids = {
  budget: '01J00000000000000000000901',
  account: '01J00000000000000000000902',
  link: '01J00000000000000000000903',
  item: '01J00000000000000000000904',
  transaction: '01J00000000000000000000905',
  allocation: '01J00000000000000000000906',
  reconciliation: '01J00000000000000000000907',
  category: '01J00000000000000000000908',
};

const source = {
  accounts: [{ id: ids.account, version: 2 }],
  links: [{ id: ids.link, accountId: ids.account, version: 1 }],
  items: [{ id: ids.item, version: 3 }],
  transactions: [
    {
      id: ids.transaction,
      accountId: ids.account,
      version: 4,
      allocations: [
        {
          id: ids.allocation,
          budgetItemId: ids.item,
          amountMinor: -4_500,
          financeCategoryId: ids.category,
        },
      ],
    },
  ],
};

describe('Budget reconciliation evidence', () => {
  it('canonicalizes source versions independently of collection order', async () => {
    const reversed = {
      accounts: [...source.accounts].reverse(),
      links: [...source.links].reverse(),
      items: [...source.items].reverse(),
      transactions: [...source.transactions].reverse(),
    };
    expect(canonicalBudgetReconciliationSource(reversed)).toBe(
      canonicalBudgetReconciliationSource(source),
    );
    expect(await digestBudgetReconciliationSource(source)).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('creates immutable exact evidence and preserves it across later budget changes', async () => {
    const digest = await digestBudgetReconciliationSource(source);
    const record = createBudgetReconciliation({
      id: ids.reconciliation,
      budgetId: ids.budget,
      reconciledAt: '2027-09-30T23:00:00.000Z',
      reconciledBy: 'member-1',
      budgetVersion: 5,
      sourceVersionDigest: digest,
      totalsByCurrency: [
        {
          currency: 'USD',
          currencyExponent: 2,
          plannedMinor: -5_000,
          actualMinor: -4_500,
          varianceMinor: 500,
        },
      ],
      totalsByCategory: [
        {
          financeCategoryId: ids.category,
          currency: 'USD',
          currencyExponent: 2,
          plannedMinor: -5_000,
          actualMinor: -4_500,
          varianceMinor: 500,
        },
      ],
    });
    const budget = createBudget({
      id: ids.budget,
      groupId: '01J00000000000000000000909',
      name: 'September',
      budgetDate: '2027-09-01',
      startDate: '2027-09-01',
      endDate: '2027-09-30',
      status: 'active',
    });
    const reconciled = markBudgetReconciled({ ...budget, version: 5 }, record.reconciledAt);
    const changed = markBudgetChangedSinceReconciliation(reconciled);

    expect(Object.isFrozen(record)).toBe(true);
    expect(reconciled).toMatchObject({
      status: 'active',
      lastReconciledAt: record.reconciledAt,
      version: 6,
    });
    expect(changed).toMatchObject({ status: 'changed-since-reconciliation', version: 7 });
    expect(record).toMatchObject({ budgetVersion: 5, sourceVersionDigest: digest });
  });

  it('rejects malformed digests, totals, and state transitions', () => {
    expect(() =>
      createBudgetReconciliation({
        id: ids.reconciliation,
        budgetId: ids.budget,
        reconciledAt: 'invalid',
        reconciledBy: '',
        budgetVersion: 0,
        sourceVersionDigest: 'bad',
        totalsByCurrency: [],
        totalsByCategory: [],
      }),
    ).toThrow();
    const draft = createBudget({
      id: ids.budget,
      groupId: '01J00000000000000000000909',
      name: 'Draft',
      budgetDate: '2027-09-01',
      startDate: '2027-09-01',
    });
    expect(() => markBudgetReconciled(draft, '2027-09-30T23:00:00.000Z')).toThrow(/active/i);
  });
});
