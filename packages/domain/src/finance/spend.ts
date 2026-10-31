import type { FinancialTransaction } from './transaction.js';
import type { BudgetItem } from './budget.js';
import { addMinorUnits, currencyExponentFor } from './money.js';
import {
  canContributeRefund,
  isPostedSpendSource,
  originalRefundPrincipal,
  type ExpenseRefundRelationship,
} from './refund.js';

export interface SpendSlice {
  transactionId: string;
  accountId: string;
  effectiveAt: string;
  currency: string;
  currencyExponent: number;
  amountMinor: number;
  merchantId?: string;
  categoryId?: string;
  subcategoryId?: string;
  budgetId?: string;
  budgetItemId?: string;
  originalAllocationId?: string;
  originalExpenseTransactionId?: string;
}
export interface SpendContext {
  budgetItems?: readonly BudgetItem[];
  refund?: ExpenseRefundRelationship | undefined;
  original?: FinancialTransaction;
}

export function buildSpendSlices(
  transaction: FinancialTransaction,
  context: SpendContext,
): SpendSlice[] {
  if (!Number.isSafeInteger(transaction.amountMinor))
    throw new Error('Transaction amount must be a safe integer.');
  if (currencyExponentFor(transaction.currency) !== transaction.currencyExponent)
    throw new Error('Invalid currency exponent.');
  if (!isPostedSpendSource(transaction)) return [];
  const common = {
    transactionId: transaction.id,
    accountId: transaction.accountId,
    effectiveAt: transaction.effectiveAt,
    currency: transaction.currency,
    currencyExponent: transaction.currencyExponent,
    ...(transaction.merchantId ? { merchantId: transaction.merchantId } : {}),
  };
  if (transaction.amountMinor > 0) {
    if (
      !context.refund ||
      !context.original ||
      !canContributeRefund(context.refund, transaction, context.original)
    )
      return [];
    return context.refund.refundedAllocations.map((a) => ({
      ...common,
      amountMinor: -a.amountMinor,
      originalExpenseTransactionId: context.original!.id,
      originalAllocationId: a.originalAllocationId,
      ...(a.categoryId ? { categoryId: a.categoryId } : {}),
      ...(a.subcategoryId ? { subcategoryId: a.subcategoryId } : {}),
      ...(a.budgetId ? { budgetId: a.budgetId } : {}),
      ...(a.budgetItemId ? { budgetItemId: a.budgetItemId } : {}),
    }));
  }
  if (transaction.amountMinor === 0) return [];
  originalRefundPrincipal(transaction); // Validate signed allocation conservation before publishing.
  if (!transaction.allocations.length)
    return [{ ...common, amountMinor: -transaction.amountMinor }];
  return transaction.allocations.map((a) => {
    const item = context.budgetItems?.find((item) => item.id === a.budgetItemId);
    if (
      item &&
      (item.currency !== transaction.currency ||
        item.currencyExponent !== transaction.currencyExponent)
    )
      throw new Error('Budget allocation currency mismatch.');
    const subcategoryId =
      'subcategoryId' in a && typeof a.subcategoryId === 'string' ? a.subcategoryId : undefined;
    return {
      ...common,
      amountMinor: -a.amountMinor,
      originalAllocationId: a.id,
      categoryId: a.financeCategoryId,
      ...(subcategoryId ? { subcategoryId } : {}),
      ...(a.budgetItemId ? { budgetItemId: a.budgetItemId } : {}),
      ...(item ? { budgetId: item.budgetId } : {}),
    };
  });
}

export interface SpendFilters {
  accountIds?: readonly string[] | undefined;
  merchantIds?: readonly string[] | undefined;
  budgetIds?: readonly string[] | undefined;
  budgetItemIds?: readonly string[] | undefined;
  categoryIds?: readonly string[] | undefined;
  subcategoryIds?: readonly string[] | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  timeZone?: string | undefined;
}

export function localFinanceDate(instant: string, timeZone: string): string {
  const date = new Date(instant);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid Finance instant.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isFinanceDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}

/** Match all allocation dimensions on one slice, never independent transaction-wide sets. */
export function filterSpendSlices(
  slices: readonly SpendSlice[],
  filters: SpendFilters,
): SpendSlice[] {
  const zone = filters.timeZone ?? 'UTC';
  new Intl.DateTimeFormat('en', { timeZone: zone });
  if (
    (filters.dateFrom && !isFinanceDate(filters.dateFrom)) ||
    (filters.dateTo && !isFinanceDate(filters.dateTo)) ||
    (filters.dateFrom && filters.dateTo && filters.dateFrom > filters.dateTo)
  )
    throw new Error('Invalid Finance date range.');
  const matches = (values: readonly string[] | undefined, value: string | undefined) =>
    !values?.length || (value !== undefined && values.includes(value));
  return slices.filter((slice) => {
    if (
      !matches(filters.accountIds, slice.accountId) ||
      !matches(filters.merchantIds, slice.merchantId) ||
      !matches(filters.budgetIds, slice.budgetId) ||
      !matches(filters.budgetItemIds, slice.budgetItemId) ||
      !matches(filters.categoryIds, slice.categoryId) ||
      !matches(filters.subcategoryIds, slice.subcategoryId)
    )
      return false;
    if (!filters.dateFrom && !filters.dateTo) return true;
    const day = localFinanceDate(slice.effectiveAt, zone);
    return (
      (!filters.dateFrom || day >= filters.dateFrom) && (!filters.dateTo || day <= filters.dateTo)
    );
  });
}

export function sumSpendByCurrency(slices: readonly SpendSlice[]) {
  const values = new Map<
    string,
    { currency: string; currencyExponent: number; amountMinor: number }
  >();
  for (const slice of slices) {
    if (currencyExponentFor(slice.currency) !== slice.currencyExponent)
      throw new Error('Invalid currency exponent.');
    const current = values.get(slice.currency);
    if (current && current.currencyExponent !== slice.currencyExponent)
      throw new Error('Currency exponent mismatch.');
    values.set(slice.currency, {
      currency: slice.currency,
      currencyExponent: slice.currencyExponent,
      amountMinor: addMinorUnits([current?.amountMinor ?? 0, slice.amountMinor]),
    });
  }
  return [...values.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}
