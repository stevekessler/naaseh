import type { Budget } from './budget.js';
import type { BudgetCategoryTotal, BudgetCurrencyTotal } from './budget-totals.js';

export interface BudgetReconciliationSource {
  accounts: ReadonlyArray<{ id: string; version: number }>;
  links: ReadonlyArray<{ id: string; accountId: string; version: number }>;
  items: ReadonlyArray<{ id: string; version: number }>;
  transactions: ReadonlyArray<{
    id: string;
    accountId: string;
    version: number;
    allocations: ReadonlyArray<{
      id: string;
      budgetItemId?: string;
      amountMinor: number;
      financeCategoryId: string;
    }>;
  }>;
}

export interface ReconciliationRecord {
  readonly id: string;
  readonly budgetId: string;
  readonly reconciledAt: string;
  readonly reconciledBy: string;
  readonly budgetVersion: number;
  readonly sourceVersionDigest: string;
  readonly totalsByCurrency: readonly Readonly<BudgetCurrencyTotal>[];
  readonly totalsByCategory: readonly Readonly<BudgetCategoryTotal>[];
}

const compareId = <T extends { id: string }>(left: T, right: T) => left.id.localeCompare(right.id);
const assertVersioned = (values: ReadonlyArray<{ id: string; version: number }>, label: string) => {
  const ids = new Set<string>();
  for (const value of values) {
    if (
      !value.id ||
      !Number.isSafeInteger(value.version) ||
      value.version < 1 ||
      ids.has(value.id)
    ) {
      throw new Error(
        `Budget reconciliation ${label} must have unique identifiers and positive versions.`,
      );
    }
    ids.add(value.id);
  }
};

/** Canonical source text is content-free version evidence, sorted so repository iteration order is irrelevant. */
export function canonicalBudgetReconciliationSource(source: BudgetReconciliationSource): string {
  assertVersioned(source.accounts, 'accounts');
  assertVersioned(source.links, 'links');
  assertVersioned(source.items, 'items');
  assertVersioned(source.transactions, 'transactions');
  const normalized = {
    accounts: [...source.accounts].sort(compareId).map(({ id, version }) => ({ id, version })),
    links: [...source.links]
      .sort(compareId)
      .map(({ id, accountId, version }) => ({ id, accountId, version })),
    items: [...source.items].sort(compareId).map(({ id, version }) => ({ id, version })),
    transactions: [...source.transactions].sort(compareId).map((transaction) => ({
      id: transaction.id,
      accountId: transaction.accountId,
      version: transaction.version,
      allocations: [...transaction.allocations].sort(compareId).map((allocation) => {
        if (
          !allocation.id ||
          !Number.isSafeInteger(allocation.amountMinor) ||
          !allocation.financeCategoryId
        ) {
          throw new Error('Budget reconciliation allocations contain invalid evidence.');
        }
        return {
          id: allocation.id,
          amountMinor: allocation.amountMinor,
          financeCategoryId: allocation.financeCategoryId,
          ...(allocation.budgetItemId ? { budgetItemId: allocation.budgetItemId } : {}),
        };
      }),
    })),
  };
  return JSON.stringify(normalized);
}

export async function digestBudgetReconciliationSource(source: BudgetReconciliationSource) {
  const bytes = new TextEncoder().encode(canonicalBudgetReconciliationSource(source));
  const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

const freezeTotals = <T extends BudgetCurrencyTotal>(values: readonly T[], label: string) => {
  if (values.length > 1_000) throw new Error(`Budget reconciliation ${label} exceeds its limit.`);
  const keys = new Set<string>();
  const copied = values.map((value) => {
    const category = 'financeCategoryId' in value ? String(value.financeCategoryId) : '';
    const key = `${category}:${value.currency}:${value.currencyExponent}`;
    if (
      keys.has(key) ||
      !/^[A-Z]{3}$/u.test(value.currency) ||
      !Number.isInteger(value.currencyExponent) ||
      value.currencyExponent < 0 ||
      value.currencyExponent > 6 ||
      !Number.isSafeInteger(value.plannedMinor) ||
      !Number.isSafeInteger(value.actualMinor) ||
      !Number.isSafeInteger(value.varianceMinor) ||
      value.varianceMinor !== value.actualMinor - value.plannedMinor
    ) {
      throw new Error(`Budget reconciliation ${label} is invalid.`);
    }
    keys.add(key);
    return Object.freeze({ ...value });
  });
  return Object.freeze(copied);
};

export function createBudgetReconciliation(input: ReconciliationRecord): ReconciliationRecord {
  if (!input.id || !input.budgetId || !input.reconciledBy) {
    throw new Error('Budget reconciliation identity is required.');
  }
  const reconciledAt = new Date(input.reconciledAt).toISOString();
  if (
    reconciledAt !== input.reconciledAt ||
    !Number.isSafeInteger(input.budgetVersion) ||
    input.budgetVersion < 1 ||
    !/^[a-f0-9]{64}$/u.test(input.sourceVersionDigest)
  ) {
    throw new Error('Budget reconciliation evidence is invalid.');
  }
  return Object.freeze({
    ...input,
    totalsByCurrency: freezeTotals(input.totalsByCurrency, 'currency totals'),
    totalsByCategory: freezeTotals(input.totalsByCategory, 'category totals'),
  });
}

export function markBudgetReconciled(budget: Budget, reconciledAt: string): Budget {
  if (budget.status !== 'active' && budget.status !== 'changed-since-reconciliation') {
    throw new Error('Only an active budget can be reconciled.');
  }
  return {
    ...budget,
    status: 'active',
    lastReconciledAt: new Date(reconciledAt).toISOString(),
    version: budget.version + 1,
  };
}

export function markBudgetChangedSinceReconciliation(budget: Budget): Budget {
  if (!budget.lastReconciledAt || budget.status !== 'active') return budget;
  return { ...budget, status: 'changed-since-reconciliation', version: budget.version + 1 };
}
