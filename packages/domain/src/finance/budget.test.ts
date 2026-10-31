import { describe, expect, it } from 'vitest';
import {
  archiveBudget,
  archiveBudgetItem,
  canPermanentlyDeleteBudget,
  canPermanentlyDeleteBudgetItem,
  createBudget,
  createBudgetAccountLink,
  createBudgetItem,
  tombstoneBudget,
  tombstoneBudgetItem,
} from './budget.js';
import { calculateBudgetTotals } from './budget-totals.js';

const ids = {
  group: '01J00000000000000000000101',
  budget: '01J00000000000000000000102',
  groupAccount: '01J00000000000000000000103',
  privateAccount: '01J00000000000000000000104',
  groceries: '01J00000000000000000000105',
  salary: '01J00000000000000000000106',
  travel: '01J00000000000000000000107',
  debitItem: '01J00000000000000000000108',
  creditItem: '01J00000000000000000000109',
  euroItem: '01J00000000000000000000110',
};

const budget = () =>
  createBudget({
    id: ids.budget,
    groupId: ids.group,
    name: 'Household plan',
    budgetDate: '2026-04-01',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
  });

const links = () => [
  createBudgetAccountLink({
    id: '01J00000000000000000000111',
    budgetId: ids.budget,
    accountId: ids.groupAccount,
    audience: { type: 'group', groupId: ids.group },
    createdBy: 'member-a',
  }),
  createBudgetAccountLink({
    id: '01J00000000000000000000112',
    budgetId: ids.budget,
    accountId: ids.privateAccount,
    audience: { type: 'owner', ownerId: 'member-a' },
    createdBy: 'member-a',
  }),
];

const items = () => [
  createBudgetItem({
    id: ids.debitItem,
    budgetId: ids.budget,
    description: 'Groceries',
    financeCategoryId: ids.groceries,
    plannedAmountMinor: -10_000,
    currency: 'USD',
    currencyExponent: 2,
    relatedAccountIds: [ids.groupAccount],
    creatorId: 'member-a',
  }),
  createBudgetItem({
    id: ids.creditItem,
    budgetId: ids.budget,
    description: 'Salary',
    financeCategoryId: ids.salary,
    plannedAmountMinor: 25_000,
    currency: 'USD',
    currencyExponent: 2,
    relatedAccountIds: [ids.groupAccount],
    creatorId: 'member-a',
  }),
  createBudgetItem({
    id: ids.euroItem,
    budgetId: ids.budget,
    description: 'Train',
    financeCategoryId: ids.travel,
    plannedAmountMinor: -5_000,
    currency: 'EUR',
    currencyExponent: 2,
    relatedAccountIds: [ids.privateAccount],
    creatorId: 'member-a',
  }),
];

describe('Finance budget domain', () => {
  it('supports bounded, single-date, and open-ended periods while rejecting reversed dates', () => {
    expect(budget()).toMatchObject({ startDate: '2026-04-01', endDate: '2026-04-30', version: 1 });
    const base = {
      groupId: ids.group,
      name: 'Household plan',
      budgetDate: '2026-04-01',
      startDate: '2026-04-15',
    };
    expect(
      createBudget({ ...base, id: '01J00000000000000000000121', endDate: '2026-04-15' }),
    ).toMatchObject({ startDate: '2026-04-15', endDate: '2026-04-15' });
    expect(
      createBudget({ ...base, id: '01J00000000000000000000122', endDate: null }),
    ).toMatchObject({ endDate: null });
    expect(() =>
      createBudget({
        ...base,
        id: '01J00000000000000000000123',
        startDate: '2026-05-01',
        endDate: '2026-04-30',
      }),
    ).toThrow(/end date/i);
  });

  it('keeps group and private account-link audiences explicit and rejects duplicate related accounts', () => {
    expect(links().map(({ audience }) => audience.type)).toEqual(['group', 'owner']);
    expect(() =>
      createBudgetItem({
        ...items()[0]!,
        id: '01J00000000000000000000124',
        relatedAccountIds: [ids.groupAccount, ids.groupAccount],
      }),
    ).toThrow(/account/i);
  });

  it('calculates exact item, category, and currency totals with signed variance', () => {
    const totals = calculateBudgetTotals({
      items: items().slice(0, 2),
      links: links().slice(0, 1),
      visibleAccountIds: [ids.groupAccount],
      transactions: [
        {
          id: 'txn-debit',
          accountId: ids.groupAccount,
          currency: 'USD',
          currencyExponent: 2,
          allocations: [{ budgetItemId: ids.debitItem, amountMinor: -8_000 }],
        },
        {
          id: 'txn-credit',
          accountId: ids.groupAccount,
          currency: 'USD',
          currencyExponent: 2,
          allocations: [{ budgetItemId: ids.creditItem, amountMinor: 25_000 }],
        },
      ],
      confirmedTransferIds: [],
    });

    expect(totals.totalsComplete).toBe(true);
    expect(totals.byCurrency).toEqual([
      {
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: 15_000,
        actualMinor: 17_000,
        varianceMinor: 2_000,
      },
    ]);
    expect(totals.byCategory).toEqual([
      {
        financeCategoryId: ids.groceries,
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: -10_000,
        actualMinor: -8_000,
        varianceMinor: 2_000,
      },
      {
        financeCategoryId: ids.salary,
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: 25_000,
        actualMinor: 25_000,
        varianceMinor: 0,
      },
    ]);
  });

  it('excludes confirmed transfers and never combines currencies into one grand total', () => {
    const totals = calculateBudgetTotals({
      items: items(),
      links: links(),
      visibleAccountIds: [ids.groupAccount, ids.privateAccount],
      transactions: [
        {
          id: 'txn-transfer',
          accountId: ids.groupAccount,
          currency: 'USD',
          currencyExponent: 2,
          transferId: 'transfer-confirmed',
          allocations: [{ budgetItemId: ids.debitItem, amountMinor: -10_000 }],
        },
        {
          id: 'txn-eur',
          accountId: ids.privateAccount,
          currency: 'EUR',
          currencyExponent: 2,
          allocations: [{ budgetItemId: ids.euroItem, amountMinor: -4_000 }],
        },
      ],
      confirmedTransferIds: ['transfer-confirmed'],
    });

    expect(totals.byCurrency).toEqual([
      {
        currency: 'EUR',
        currencyExponent: 2,
        plannedMinor: -5_000,
        actualMinor: -4_000,
        varianceMinor: 1_000,
      },
      {
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: 15_000,
        actualMinor: 0,
        varianceMinor: -15_000,
      },
    ]);
    expect(totals).not.toHaveProperty('grandTotal');
  });

  it('marks a viewer-incomplete result without exposing a hidden link or contribution', () => {
    const totals = calculateBudgetTotals({
      items: items(),
      links: links(),
      visibleAccountIds: [ids.groupAccount],
      transactions: [
        {
          id: 'txn-visible',
          accountId: ids.groupAccount,
          currency: 'USD',
          currencyExponent: 2,
          allocations: [{ budgetItemId: ids.debitItem, amountMinor: -8_000 }],
        },
        {
          id: 'txn-hidden',
          accountId: ids.privateAccount,
          currency: 'EUR',
          currencyExponent: 2,
          allocations: [{ budgetItemId: ids.euroItem, amountMinor: -4_321 }],
        },
      ],
      confirmedTransferIds: [],
    });

    expect(totals.totalsComplete).toBe(false);
    expect(totals.byCurrency).toEqual([
      {
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: 15_000,
        actualMinor: -8_000,
        varianceMinor: -23_000,
      },
    ]);
    expect(JSON.stringify(totals)).not.toContain(ids.privateAccount);
    expect(JSON.stringify(totals)).not.toContain('4321');
  });

  it('archives referenced records, tombstones protected content, and deletes only unreferenced draft mistakes', () => {
    const draft = budget();
    const item = items()[0]!;
    expect(canPermanentlyDeleteBudget(draft, { hasReferences: false, isMistake: true })).toBe(true);
    expect(canPermanentlyDeleteBudget(draft, { hasReferences: true, isMistake: true })).toBe(false);
    expect(
      canPermanentlyDeleteBudget(
        { ...draft, status: 'active' },
        { hasReferences: false, isMistake: true },
      ),
    ).toBe(false);
    expect(archiveBudget(draft)).toMatchObject({ status: 'archived', version: 2 });
    expect(tombstoneBudget(draft)).toMatchObject({
      name: 'Deleted budget',
      status: 'tombstone',
      version: 2,
    });

    expect(
      canPermanentlyDeleteBudgetItem(item, {
        budgetStatus: 'draft',
        hasReferences: false,
        isMistake: true,
      }),
    ).toBe(true);
    expect(
      canPermanentlyDeleteBudgetItem(item, {
        budgetStatus: 'active',
        hasReferences: false,
        isMistake: true,
      }),
    ).toBe(false);
    expect(archiveBudgetItem(item)).toMatchObject({ status: 'archived', version: 2 });
    expect(tombstoneBudgetItem(item)).toMatchObject({
      description: 'Deleted budget item',
      relatedAccountIds: [],
      status: 'tombstone',
      version: 2,
    });
  });
});
