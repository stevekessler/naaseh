import {
  buildSpendSlices,
  localFinanceDate,
  sumSpendByCurrency,
  type SpendSlice,
} from './spend.js';
import type { FinancialTransaction } from './transaction.js';
import type { ExpenseRefundRelationship } from './refund.js';

export const financeTrendModes = ['month', 'quarter', 'year'] as const;
export type FinanceTrendMode = (typeof financeTrendModes)[number];

export function financeTrendPeriods(mode: FinanceTrendMode, timeZone: string, now: string) {
  const today = localFinanceDate(now, timeZone);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7)) - 1;
  const width = mode === 'year' ? 12 : mode === 'quarter' ? 3 : 1;
  const count = mode === 'year' ? 5 : mode === 'quarter' ? 8 : 12;
  const current = Math.floor(month / width) * width;
  const date = (m: number, day: number) =>
    new Date(Date.UTC(year, m, day)).toISOString().slice(0, 10);
  return Array.from({ length: count }, (_, index) => {
    const start = current - (count - 1 - index) * width;
    const dateFrom = date(start, 1);
    const fromYear = dateFrom.slice(0, 4);
    const fromMonth = Number(dateFrom.slice(5, 7));
    return {
      dateFrom,
      dateTo: index === count - 1 ? today : date(start + width, 0),
      label:
        mode === 'year'
          ? fromYear
          : mode === 'quarter'
            ? `Q${Math.ceil(fromMonth / 3)} ${fromYear}`
            : dateFrom.slice(0, 7),
      partial: index === count - 1,
    };
  });
}

export function calculateCachedSpendTrend(input: {
  periods: readonly { dateFrom: string; dateTo: string }[];
  timeZone: string;
  selected: readonly string[];
  transactions: readonly FinancialTransaction[];
  refunds: readonly ExpenseRefundRelationship[];
}) {
  const { periods, timeZone, selected, transactions, refunds } = input;
  const byId = new Map(transactions.map((row) => [row.id, row]));
  const byRefund = new Map(
    refunds
      .filter(({ status }) => status === 'active')
      .map((refund) => [refund.refundTransactionId, refund]),
  );
  const accounts = new Set(selected);
  const buckets: SpendSlice[][] = periods.map(() => []);
  for (const row of byId.values()) {
    if (!accounts.has(row.accountId)) continue;
    const date = localFinanceDate(row.effectiveAt, timeZone);
    const bucket = periods.findIndex(({ dateFrom, dateTo }) => date >= dateFrom && date <= dateTo);
    if (bucket < 0) continue;
    const refund = byRefund.get(row.id);
    const original = refund && byId.get(refund.originalExpenseTransactionId);
    buckets[bucket]!.push(...buildSpendSlices(row, refund && original ? { refund, original } : {}));
  }
  return buckets.map(sumSpendByCurrency);
}
