import { addMinorUnits } from './money.js';
import type { BudgetAccountLink, BudgetItem } from './budget.js';
import type { FinancialTransaction } from './transaction.js';
import type { ExpenseRefundRelationship } from './refund.js';
import { buildSpendSlices, sumSpendByCurrency } from './spend.js';

export interface BudgetTotalTransaction {
  id: string;
  accountId: string;
  currency: string;
  currencyExponent: number;
  transferId?: string;
  status?: 'active' | 'archived' | 'tombstone';
  allocations: ReadonlyArray<{ budgetItemId?: string; amountMinor: number }>;
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

/** Dashboard spending has posted/refund semantics; historical reconciliation above stays unchanged. */
export function calculateDashboardBudgetTotals(input: {
  budgetId: string;
  items: readonly BudgetItem[];
  transactions: readonly FinancialTransaction[];
  refunds: readonly ExpenseRefundRelationship[];
  visibleAccountIds: readonly string[];
}) {
  const visible = new Set(input.visibleAccountIds);
  const items = input.items.filter(
    (item) =>
      item.budgetId === input.budgetId &&
      item.status === 'active' &&
      item.relatedAccountIds.every((id) => visible.has(id)),
  );
  const itemIds = new Set(items.map((item) => item.id));
  const sources = new Map(
    input.transactions.filter((t) => visible.has(t.accountId)).map((t) => [t.id, t]),
  );
  const slices = [...sources.values()]
    .flatMap((transaction) => {
      const refund = input.refunds.find(
        (r) => r.refundTransactionId === transaction.id && r.status === 'active',
      );
      const original = refund ? sources.get(refund.originalExpenseTransactionId) : undefined;
      return buildSpendSlices(transaction, {
        budgetItems: input.items,
        refund,
        ...(original ? { original } : {}),
      });
    })
    .filter(
      (slice) =>
        slice.budgetId === input.budgetId && slice.budgetItemId && itemIds.has(slice.budgetItemId),
    );
  const actuals = sumSpendByCurrency(slices);
  const currencies = new Set([
    ...items.map((item) => item.currency),
    ...actuals.map((actual) => actual.currency),
  ]);
  return [...currencies].sort().map((currency) => {
    const planned = items.filter((item) => item.currency === currency);
    const plannedMinor = addMinorUnits(
      planned.filter((item) => item.plannedAmountMinor < 0).map((item) => -item.plannedAmountMinor),
    );
    const actual = actuals.find((value) => value.currency === currency);
    const spentMinor = actual?.amountMinor ?? 0;
    return {
      currency,
      currencyExponent: actual?.currencyExponent ?? planned[0]!.currencyExponent,
      plannedMinor,
      spentMinor,
      remainingMinor: addMinorUnits([plannedMinor, -spentMinor]),
      percentUsed: plannedMinor === 0 ? null : (spentMinor / plannedMinor) * 100,
    };
  });
}
