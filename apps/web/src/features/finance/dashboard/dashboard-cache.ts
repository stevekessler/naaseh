import { financeDashboardPreferencesResponseSchema } from '@naaseh/contracts';
import {
  deriveUpcomingExpenseState,
  expenseFulfillmentSchema,
  localFinanceDate,
  upcomingExpenseSchema,
} from '@naaseh/domain';
import { db } from '../../../db/database.js';
import { decryptFinanceRecord, financeDeviceKey } from '../../../db/finance-repository.js';
import { decryptText, encryptText } from '../../../crypto/vault.js';
import { readFinanceCachedData } from '../../../sync/finance-cache-access.js';
import type { FinanceDashboardAccount } from './AccountBalancesWidget.js';

const keyFor = (ownerId: string) => `finance-dashboard-preferences:${ownerId}:v1`;
type Preferences = ReturnType<typeof financeDashboardPreferencesResponseSchema.parse>;

export async function saveCachedDashboardPreferences(ownerId: string, preferences: Preferences) {
  const cacheKey = keyFor(ownerId);
  const value = await encryptText(JSON.stringify(preferences), await financeDeviceKey(), cacheKey);
  await db.settings.put({ key: cacheKey, value: JSON.stringify(value) });
}

export async function readCachedDashboardPreferences(ownerId: string) {
  return readFinanceCachedData(async () => {
    const cacheKey = keyFor(ownerId);
    const row = await db.settings.get(cacheKey);
    if (!row) throw new Error('Dashboard settings are unavailable offline.');
    const value = await decryptText(JSON.parse(row.value), await financeDeviceKey(), cacheKey);
    return financeDashboardPreferencesResponseSchema.parse(JSON.parse(value));
  });
}

export async function readCachedDashboardItems(path: string) {
  return readFinanceCachedData(async (lease) => {
    const store = db.secureFinanceRecords;
    const key = await financeDeviceKey();
    const sources = new Set<string>();
    const accounts: FinanceDashboardAccount[] = [];
    for (const row of await store.where('entityType').equals('financeAccount').toArray()) {
      const value = (await decryptFinanceRecord(row, key, lease)) as
        | (FinanceDashboardAccount & { status?: string })
        | undefined;
      if (!value?.id || value.status !== 'active' || value.id !== row.id) continue;
      sources.add(value.id);
      if (
        typeof value.friendlyName === 'string' &&
        /^[A-Z]{3}$/u.test(value.currency) &&
        Number.isSafeInteger(value.currentBalanceMinor) &&
        Number.isInteger(value.currencyExponent)
      )
        accounts.push({
          ...value,
          ...(value.freshness
            ? {
                freshness: { ...value.freshness, stale: true },
              }
            : {}),
        });
    }
    if (path === '/finance/accounts') return accounts;
    const budgetIds = new Set<string>();
    for (const row of await store.where('entityType').equals('financeBudget').toArray()) {
      const value = (await decryptFinanceRecord(row, key, lease)) as
        | { id?: string; status?: string }
        | undefined;
      if (value?.id === row.id && value.status !== 'tombstone') budgetIds.add(row.id);
    }
    const byExpense = new Map<string, ReturnType<typeof expenseFulfillmentSchema.parse>[]>();
    for (const row of await store.where('entityType').equals('financeFulfillment').toArray()) {
      const result = expenseFulfillmentSchema.safeParse(
        await decryptFinanceRecord(row, key, lease),
      );
      if (!result.success || !sources.has(result.data.accountId)) continue;
      const id = result.data.upcomingExpenseId;
      const claims = byExpense.get(id) ?? [];
      claims.push(result.data);
      byExpense.set(id, claims);
    }
    const today = localFinanceDate(
      new Date().toISOString(),
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    const expenses = [];
    for (const row of await store.where('entityType').equals('financeUpcomingExpense').toArray()) {
      const result = upcomingExpenseSchema.safeParse(await decryptFinanceRecord(row, key, lease));
      if (
        !result.success ||
        !sources.has(result.data.accountId) ||
        !budgetIds.has(result.data.budgetId)
      )
        continue;
      const expense = result.data;
      const fulfillments = byExpense.get(expense.id) ?? [];
      expenses.push({
        expense,
        fulfillments,
        claimVersions: {},
        ...deriveUpcomingExpenseState(expense, fulfillments, today),
      });
    }
    return expenses;
  });
}
