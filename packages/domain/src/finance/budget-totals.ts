import { addMinorUnits } from './money.js';
import type { BudgetAccountLink, BudgetItem } from './budget.js';

export interface BudgetTotalTransaction {
  id: string;
  accountId: string;
  currency: string;
  currencyExponent: number;
  transferId?: string;
  status?: 'active' | 'archived' | 'tombstone';
  allocations: ReadonlyArray<{ budgetItemId?: string; budgetId?: string; amountMinor: number }>;
}

export interface BudgetCurrencyTotal {
  currency: string;
  currencyExponent: number;
  plannedMinor: number;
  actualMinor: number;
  varianceMinor: number;
}

export interface BudgetCategoryTotal extends BudgetCurrencyTotal {
  financeCategoryId: string;
}

interface Aggregate {
  currency: string;
  currencyExponent: number;
  planned: number[];
  actual: number[];
}

export interface CalculateBudgetTotalsInput {
  budgetId?: string;
  items: readonly BudgetItem[];
  links: readonly BudgetAccountLink[];
  visibleAccountIds: readonly string[];
  transactions: readonly BudgetTotalTransaction[];
  confirmedTransferIds: readonly string[];
}

const total = (aggregate: Aggregate): BudgetCurrencyTotal => {
  const plannedMinor = addMinorUnits(aggregate.planned);
  const actualMinor = addMinorUnits(aggregate.actual);
  return {
    currency: aggregate.currency,
    currencyExponent: aggregate.currencyExponent,
    plannedMinor,
    actualMinor,
    varianceMinor: addMinorUnits([actualMinor, -plannedMinor]),
  };
};

const aggregateFor = (
  map: Map<string, Aggregate>,
  key: string,
  currency: string,
  currencyExponent: number,
) => {
  const existing = map.get(key);
  if (existing) {
    if (existing.currency !== currency || existing.currencyExponent !== currencyExponent) {
      throw new Error('Budget totals cannot combine different currencies or exponents.');
    }
    return existing;
  }
  const created = { currency, currencyExponent, planned: [], actual: [] };
  map.set(key, created);
  return created;
};

export function calculateBudgetTotals(input: CalculateBudgetTotalsInput) {
  const visible = new Set(input.visibleAccountIds);
  const activeLinks = input.links.filter(({ status }) => status === 'active');
  const linked = new Set(activeLinks.map(({ accountId }) => accountId));
  const visibleLinked = new Set(
    activeLinks.filter(({ accountId }) => visible.has(accountId)).map(({ accountId }) => accountId),
  );
  const totalsComplete = activeLinks.every(({ accountId }) => visible.has(accountId));
  const confirmedTransfers = new Set(input.confirmedTransferIds);

  // An item's planned amount cannot be safely divided between visible and hidden related accounts,
  // so omit the whole item whenever any of its account relationships is hidden from this viewer.
  const items = input.items.filter(
    (item) =>
      item.status === 'active' &&
      item.relatedAccountIds.every((accountId) => visibleLinked.has(accountId)),
  );
  const itemById = new Map(items.map((item) => [item.id, item]));
  const currencyAggregates = new Map<string, Aggregate>();
  const categoryAggregates = new Map<string, Aggregate>();

  for (const item of items) {
    aggregateFor(
      currencyAggregates,
      `${item.currency}:${item.currencyExponent}`,
      item.currency,
      item.currencyExponent,
    ).planned.push(item.plannedAmountMinor);
    aggregateFor(
      categoryAggregates,
      `${item.financeCategoryId}:${item.currency}:${item.currencyExponent}`,
      item.currency,
      item.currencyExponent,
    ).planned.push(item.plannedAmountMinor);
  }

  for (const transaction of input.transactions) {
    if (
      !linked.has(transaction.accountId) ||
      !visibleLinked.has(transaction.accountId) ||
      (transaction.status !== undefined && transaction.status !== 'active') ||
      (transaction.transferId !== undefined && confirmedTransfers.has(transaction.transferId))
    )
      continue;
    for (const allocation of transaction.allocations) {
      if (!allocation.budgetItemId) continue;
      const item = itemById.get(allocation.budgetItemId);
      if (input.budgetId && (allocation.budgetId ?? item?.budgetId) !== input.budgetId) continue;
      if (!item) continue;
      if (!Number.isSafeInteger(allocation.amountMinor)) {
        throw new Error('Budget actual amounts must be safe integers.');
      }
      if (
        transaction.currency !== item.currency ||
        transaction.currencyExponent !== item.currencyExponent
      ) {
        throw new Error('A budget allocation currency must match its budget item.');
      }
      aggregateFor(
        currencyAggregates,
        `${item.currency}:${item.currencyExponent}`,
        item.currency,
        item.currencyExponent,
      ).actual.push(allocation.amountMinor);
      aggregateFor(
        categoryAggregates,
        `${item.financeCategoryId}:${item.currency}:${item.currencyExponent}`,
        item.currency,
        item.currencyExponent,
      ).actual.push(allocation.amountMinor);
    }
  }

  const byCurrency = [...currencyAggregates.values()]
    .map(total)
    .sort(
      (left, right) =>
        left.currency.localeCompare(right.currency) ||
        left.currencyExponent - right.currencyExponent,
    );
  const byCategory = [...categoryAggregates.entries()]
    .map(([key, aggregate]) => ({
      financeCategoryId: key.slice(0, key.indexOf(':')),
      ...total(aggregate),
    }))
    .sort(
      (left, right) =>
        left.financeCategoryId.localeCompare(right.financeCategoryId) ||
        left.currency.localeCompare(right.currency) ||
        left.currencyExponent - right.currencyExponent,
    );

  return { byCurrency, byCategory, totalsComplete };
}
