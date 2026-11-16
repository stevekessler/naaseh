import { financeSpendTrendResponseSchema, financialTransactionSchema } from '@naaseh/contracts';
import {
  expenseRefundRelationshipSchema,
  type FinanceTrendMode,
  type FinancialTransaction,
} from '@naaseh/domain';
import { db } from '../../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../../db/finance-repository.js';
import { readFinanceCachedData } from '../../../sync/finance-cache-access.js';
import { aggregateCachedSpend } from '../../../search/finance-index.js';
import { financeRequest } from '../finance-client.js';
import { dashboardBatch, finishDashboardQuery } from './dashboard-query.js';

export type TrendPeriod = ReturnType<typeof import('@naaseh/domain').financeTrendPeriods>[number];
export type TrendTotal = { currency: string; currencyExponent: number; amountMinor: number };

export async function readSpendTrend(
  mode: FinanceTrendMode,
  timeZone: string,
  periods: TrendPeriod[],
  accountIds: string[],
  csrfToken: string,
  signal: AbortSignal,
) {
  const jobs = await dashboardBatch(
    periods.map((_, index) => index),
    async (period) => {
      const result = financeSpendTrendResponseSchema.parse(
        await financeRequest('/finance/spend-trends', {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          signal,
          body: JSON.stringify({ mode, timeZone, period, accountIds }),
        }),
      );
      if (
        result.dateFrom !== periods[period]?.dateFrom ||
        result.dateTo !== periods[period]?.dateTo
      )
        throw new Error('Spend period changed. Try again.');
      return result.queryId;
    },
  );
  let revision: string | undefined;
  return dashboardBatch(jobs, async (id) => {
    const result = await finishDashboardQuery(id, signal, 'totals');
    if (
      !result.totalsByCurrency ||
      !result.sourceRevision ||
      (revision && revision !== result.sourceRevision)
    )
      throw new Error('Spend source changed. Try again.');
    revision = result.sourceRevision;
    return result.totalsByCurrency;
  });
}

export async function readCachedSpendTrend(
  periods: TrendPeriod[],
  timeZone: string,
  requested: readonly string[] | null,
  signal: AbortSignal,
) {
  return readFinanceCachedData(async (lease) => {
    const store = db.secureFinanceRecords;
    const key = await financeDeviceKey();
    const accounts = await store.where('entityType').equals('financeAccount').toArray();
    const options: {
      id: string;
      friendlyName: string;
      currency: string;
      currencyExponent: number;
    }[] = [];
    for (const row of accounts) {
      signal.throwIfAborted();
      const value = (await decryptFinanceRecord(row, key, lease)) as
        | ((typeof options)[number] & { status?: string })
        | undefined;
      if (
        value?.id &&
        value.status === 'active' &&
        /^[A-Z]{3}$/u.test(value.currency) &&
        Number.isInteger(value.currencyExponent) &&
        typeof value.friendlyName === 'string'
      )
        options.push(value);
    }
    const visible = new Set(options.map(({ id }) => id));
    const selected = requested === null ? [...visible] : requested.filter((id) => visible.has(id));
    const transactions: FinancialTransaction[] = [];
    const refunds = [];
    for (const row of await store
      .where('entityType')
      .anyOf(['financeTransaction', 'financeRefundRelationship'])
      .toArray()) {
      signal.throwIfAborted();
      if (row.entityType === 'financeTransaction') {
        if (!row.accountId || !visible.has(row.accountId)) continue;
        const parsed = financialTransactionSchema.safeParse(
          await decryptFinanceRecord(row, key, lease),
        );
        if (parsed.success && parsed.data.effectiveAt && visible.has(parsed.data.accountId))
          transactions.push(parsed.data as FinancialTransaction);
      } else {
        const parsed = expenseRefundRelationshipSchema.safeParse(
          await decryptFinanceRecord(row, key, lease),
        );
        if (parsed.success && parsed.data.status === 'active') refunds.push(parsed.data);
      }
    }
    return {
      options,
      selected,
      totals: await aggregateCachedSpend(
        { periods, timeZone, selected, transactions, refunds },
        signal,
      ),
    };
  });
}
