import {
  expenseRefundRelationshipSchema,
  buildSpendSlices,
  type Budget,
  type BudgetItem,
  type FinancialTransaction,
  type SpendSlice,
} from '@naaseh/domain';
import { financeQueryEnvelopeSchema, parseSpendReportFilters } from '@naaseh/contracts';
import { db } from '../../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../../db/finance-repository.js';
import { filterCachedFinanceSpend } from '../../../search/finance-index.js';
import { readFinanceCachedData } from '../../../sync/finance-cache-access.js';
import { financeRequest } from '../finance-client.js';
import { z } from 'zod';

const currency = {
  currency: z.string().regex(/^[A-Z]{3}$/u),
  currencyExponent: z.number().int().min(0).max(4),
  amountMinor: z.number().int().safe(),
};
const reportSlice = z.object({
  ...currency,
  transactionId: z.string().min(1),
  accountId: z.string().min(1),
  effectiveAt: z.string().datetime({ offset: true }),
  merchantId: z.string().optional(),
  budgetId: z.string().optional(),
  categoryId: z.string().optional(),
  subcategoryId: z.string().optional(),
});
const reportRow = z.object({
  ...currency,
  id: z.string().min(1),
  accountId: z.string().min(1),
  description: z.string(),
  effectiveAt: z.string().datetime({ offset: true }),
  slices: z.array(reportSlice),
});
export type ReportRow = Omit<z.infer<typeof reportRow>, 'slices'> & {
  slices?: SpendSlice[];
  matchedMinor?: number;
};
export type ReportPage = Omit<ReturnType<typeof financeQueryEnvelopeSchema.parse>, 'items'> & {
  items: ReportRow[];
};

export async function requestSpendReport(path: string, signal: AbortSignal): Promise<ReportPage> {
  const result = financeQueryEnvelopeSchema.parse(await financeRequest(path, { signal }));
  return {
    ...result,
    items: result.items.map((row) => {
      const parsed = reportRow.parse(row);
      const slices = parsed.slices.map(
        ({ merchantId, budgetId, categoryId, subcategoryId, ...slice }) => ({
          ...slice,
          ...(merchantId ? { merchantId } : {}),
          ...(budgetId ? { budgetId } : {}),
          ...(categoryId ? { categoryId } : {}),
          ...(subcategoryId ? { subcategoryId } : {}),
        }),
      );
      return { ...parsed, slices };
    }),
  };
}

export async function readCachedSpendReport(query: string, signal: AbortSignal) {
  const filters = parseSpendReportFilters(new URLSearchParams(query));
  return readFinanceCachedData(async (lease) => {
    const table = db.secureFinanceRecords;
    const key = await financeDeviceKey();
    let lastCachedChange: string | undefined;
    const read = async <T>(type: string) => {
      const values: T[] = [];
      for (const record of await table.where('entityType').equals(type).toArray()) {
        signal.throwIfAborted();
        const value = (await decryptFinanceRecord(record, key, lease)) as T | undefined;
        if (!value) continue;
        values.push(value);
        if (!lastCachedChange || record.updatedAt > lastCachedChange)
          lastCachedChange = record.updatedAt;
      }
      return values;
    };
    const [accountRows, transactionRows, refundRows, items, budgets, merchants, categories] =
      await Promise.all([
        read<{ id: string; friendlyName: string; status: string }>('financeAccount'),
        read<FinancialTransaction>('financeTransaction'),
        read<unknown>('financeRefundRelationship'),
        read<BudgetItem>('financeBudgetItem'),
        read<Budget>('financeBudget'),
        read<{ id: string; name: string; status: string }>('financeMerchant'),
        read<{ id: string; name: string; parentId?: string }>('financeCategory'),
      ]);
    const accounts = accountRows.filter((item) => !['deleting', 'tombstone'].includes(item.status));
    const accessibleAccounts = new Set(accounts.map(({ id }) => id));
    const transactions = new Map(
      transactionRows
        .filter((row) => row.status === 'active' && accessibleAccounts.has(row.accountId))
        .map((row) => [row.id, row]),
    );
    const accessibleBudgets = new Set(budgets.map(({ id }) => id));
    const budgetItems = new Map(
      items.filter((item) => accessibleBudgets.has(item.budgetId)).map((item) => [item.id, item]),
    );
    const refunds = new Map(
      refundRows.flatMap((row) => {
        const refund = expenseRefundRelationshipSchema.safeParse(row);
        return refund.success ? [[refund.data.refundTransactionId, refund.data] as const] : [];
      }),
    );
    const slices: SpendSlice[] = [];
    for (const transaction of transactions.values()) {
      signal.throwIfAborted();
      if (filters.accountIds?.length && !filters.accountIds.includes(transaction.accountId))
        continue;
      const refund = refunds.get(transaction.id);
      const original = refund && transactions.get(refund.originalExpenseTransactionId);
      const knownBudgetItems = transaction.allocations.flatMap(({ budgetItemId }) => {
        const item = budgetItemId ? budgetItems.get(budgetItemId) : undefined;
        return item ? [item] : [];
      });
      slices.push(
        ...buildSpendSlices(transaction, {
          budgetItems: knownBudgetItems,
          ...(refund && original ? { refund, original } : {}),
        }).filter(
          (slice) =>
            (!slice.budgetItemId || budgetItems.has(slice.budgetItemId)) &&
            (!slice.budgetId || accessibleBudgets.has(slice.budgetId)),
        ),
      );
    }
    const result = await filterCachedFinanceSpend({ spendSlices: slices, filters }, signal);
    const rows = result.ids
      .map((id) => {
        const row = transactions.get(id)!;
        return { ...row, matchedMinor: result.amounts[id]! };
      })
      .sort(
        (left, right) =>
          Date.parse(right.effectiveAt) - Date.parse(left.effectiveAt) ||
          right.id.localeCompare(left.id),
      );
    return {
      rows,
      totals: result.totals,
      examined: transactions.size,
      lastCachedChange,
      catalog: {
        accountIds: accounts.map(({ id, friendlyName }) => ({ id, name: friendlyName })),
        budgetIds: budgets,
        merchantIds: merchants.filter(({ status }) => status === 'active'),
        categoryIds: categories.filter(({ parentId }) => !parentId),
        subcategoryIds: categories.filter(({ parentId }) => parentId),
      },
    };
  });
}
