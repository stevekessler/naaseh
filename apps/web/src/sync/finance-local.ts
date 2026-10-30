import { db } from '../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../db/finance-repository.js';
import type { BudgetDetailView } from '../features/finance/budgets/FinanceBudgetDetail.js';
import type { FinanceScope } from '@naaseh/domain';
export async function loadLocalFinanceBudgets() {
  const key = await financeDeviceKey();
  const records = await db.secureFinanceRecords.toArray();
  const decoded = await Promise.all(
    records.map(async (record) => ({
      type: record.entityType,
      id: record.id,
      value: await decryptFinanceRecord(record, key),
    })),
  );
  const budgets = decoded
    .filter((item) => item.type === 'financeBudget')
    .map((item) => {
      const budget = item.value as BudgetDetailView;
      const items = decoded
        .filter(
          (row) =>
            row.type === 'financeBudgetItem' &&
            (
              (row.value as { budgetId?: string; budgetIds?: string[] }).budgetIds ?? [
                (row.value as { budgetId?: string }).budgetId,
              ]
            ).includes(item.id),
        )
        .map((row) => {
          const value = row.value as BudgetDetailView['items'][number] & {
            actualByBudget?: Record<string, object>;
          };
          return { ...value, ...value.actualByBudget?.[item.id] };
        });
      const reconciliations = decoded
        .filter(
          (row) =>
            row.type === 'financeReconciliation' &&
            (
              (row.value as { budgetId?: string; budgetIds?: string[] }).budgetIds ?? [
                (row.value as { budgetId?: string }).budgetId,
              ]
            ).includes(item.id),
        )
        .map((row) => row.value as NonNullable<BudgetDetailView['reconciliations']>[number]);
      return {
        ...budget,
        id: item.id,
        items,
        accountLinks: decoded
          .filter(
            (row) =>
              row.type === 'financeBudgetAccountLink' &&
              (row.value as { budgetId?: string }).budgetId === item.id,
          )
          .map((row) => row.value as { accountId: string; status: string }),
        totals: budget.totals ?? [],
        totalsComplete: budget.totalsComplete ?? false,
        reconciliations,
      };
    });
  const accounts = decoded
    .filter((item) => item.type === 'financeAccount')
    .map(
      (item) =>
        item.value as { id: string; friendlyName: string; currency: string; scope: FinanceScope },
    );
  const categories = decoded
    .filter((item) => item.type === 'financeCategory')
    .map((item) => item.value as { id: string; name: string });
  return { budgets, accounts, categories };
}
