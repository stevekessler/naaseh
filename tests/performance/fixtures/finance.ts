import type { BudgetAccountLink, BudgetItem } from '@naaseh/domain';
import type { FinanceSearchSource } from '../../../apps/web/src/search/finance-index.js';

export const FINANCE_PERFORMANCE_PROFILE = Object.freeze({
  accountCount: 50,
  transactionCount: 100_000,
  csvRowCount: 50_000,
  merchantCount: 500,
  measuredIterations: 20,
  fixedDate: '2026-10-01',
});

const accountId = (index: number) =>
  `finance-performance-account-${String(index).padStart(2, '0')}`;
const transactionId = (index: number) =>
  `finance-performance-transaction-${String(index).padStart(6, '0')}`;

export function buildFinanceSearchFixture(): FinanceSearchSource {
  const accounts = Array.from({ length: FINANCE_PERFORMANCE_PROFILE.accountCount }, (_, index) => ({
    id: accountId(index),
    friendlyName: `Performance Account ${index + 1}`,
  }));
  const transactions = Array.from(
    { length: FINANCE_PERFORMANCE_PROFILE.transactionCount },
    (_, index) => ({
      id: transactionId(index),
      accountId: accountId(index % accounts.length),
      description:
        index === FINANCE_PERFORMANCE_PROFILE.transactionCount - 1
          ? 'Performance needle purchase'
          : `Seeded purchase ${index % 1_000}`,
      payee: `Merchant ${index % FINANCE_PERFORMANCE_PROFILE.merchantCount}`,
      memo: index % 10 === 0 ? `Recurring memo ${index % 100}` : undefined,
      effectiveAt: `2026-10-${String((index % 28) + 1).padStart(2, '0')}T12:00:00.000Z`,
      pending: index % 20 === 0,
      amountMinor: -((index % 20_000) + 1),
      currency: 'USD',
      currencyExponent: 2,
    }),
  );
  const merchants = Array.from(
    { length: FINANCE_PERFORMANCE_PROFILE.merchantCount },
    (_, index) => ({
      id: `finance-performance-merchant-${String(index).padStart(3, '0')}`,
      name: `Merchant ${index}`,
      city: index % 2 === 0 ? 'Denver' : 'Boulder',
      region: 'CO',
    }),
  );
  return { accounts, transactions, merchants };
}

export function buildFinanceBudgetFixture(): {
  items: BudgetItem[];
  links: BudgetAccountLink[];
  visibleAccountIds: string[];
  transactions: Array<{
    id: string;
    accountId: string;
    currency: string;
    currencyExponent: number;
    status: 'active';
    allocations: Array<{ budgetItemId: string; amountMinor: number }>;
  }>;
  confirmedTransferIds: string[];
} {
  const visibleAccountIds = Array.from(
    { length: FINANCE_PERFORMANCE_PROFILE.accountCount },
    (_, index) => accountId(index),
  );
  const links = visibleAccountIds.map(
    (id, index): BudgetAccountLink => ({
      id: `finance-performance-link-${index}`,
      budgetId: 'finance-performance-budget',
      accountId: id,
      audience: { type: 'owner', ownerId: 'performance-owner' },
      status: 'active',
      createdBy: 'performance-owner',
      version: 1,
    }),
  );
  const items = Array.from(
    { length: 100 },
    (_, index): BudgetItem => ({
      id: `finance-performance-budget-item-${index}`,
      budgetId: 'finance-performance-budget',
      description: `Performance budget item ${index}`,
      financeCategoryId: `finance-performance-category-${index % 20}`,
      plannedAmountMinor: 100_000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [accountId(index % visibleAccountIds.length)],
      creatorId: 'performance-owner',
      status: 'active',
      version: 1,
    }),
  );
  const transactions = Array.from(
    { length: FINANCE_PERFORMANCE_PROFILE.transactionCount },
    (_, index) => ({
      id: transactionId(index),
      accountId: accountId(index % visibleAccountIds.length),
      currency: 'USD',
      currencyExponent: 2,
      status: 'active' as const,
      allocations: [
        {
          budgetItemId: items[index % items.length]!.id,
          amountMinor: -((index % 500) + 1),
        },
      ],
    }),
  );
  return { items, links, visibleAccountIds, transactions, confirmedTransferIds: [] };
}

export function buildFinanceCsvFixture() {
  const rows = Array.from(
    { length: FINANCE_PERFORMANCE_PROFILE.csvRowCount },
    (_, index) =>
      `2026-10-${String((index % 28) + 1).padStart(2, '0')},Seeded purchase ${index},-${(
        (index % 10_000) +
        1
      ).toFixed(2)}`,
  );
  return `date,description,amount\n${rows.join('\n')}\n`;
}

export function percentile95(samples: readonly number[]) {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * 0.95) - 1]!;
}
