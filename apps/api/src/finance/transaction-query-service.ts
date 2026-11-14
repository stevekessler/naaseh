import {
  financeQueryFiltersSchema,
  financeQueryPageSchema,
  financeQueryStartSchema,
} from '@naaseh/contracts';
import { SafeApiError } from '../shared/http.js';
import type { createFinanceQueryRuntime } from './query-runtime.js';

type TransactionQueryRuntime = Pick<ReturnType<typeof createFinanceQueryRuntime>, 'start' | 'page'>;
const amountFields = ['amount', 'amountMin', 'amountMax'] as const;
const textFields = [
  'text',
  'date',
  'dateFrom',
  'dateTo',
  'timeZone',
  'currency',
  'accountName',
  'checkNumber',
] as const;

function invalidScope() {
  return new SafeApiError(
    400,
    'finance_transaction_scope_invalid',
    'Choose valid accounts or restart the transaction query.',
    'validation',
  );
}

export function parseTransactionBrowseRequest(
  rawQuery: string,
  accountId?: string,
  defaultAccounts?: string[],
) {
  const params = new URLSearchParams(rawQuery);
  const selected = params.getAll('accountIds[]');
  if (accountId && selected.some((id) => id !== accountId)) throw invalidScope();
  // A browse URL starts a new query. Continuations go to the job's bound rows URL.
  if (params.has('cursor') || params.has('queryId')) throw invalidScope();
  const filters: Record<string, unknown> = { transactionBrowse: true };
  for (const field of textFields) {
    if (params.has(field)) filters[field] = params.get(field);
  }
  for (const field of amountFields) {
    const value = params.get(field);
    if (value === null) continue;
    if (!/^-?\d+$/u.test(value)) {
      throw new SafeApiError(
        400,
        'finance_amount_invalid',
        'Enter an amount in signed minor units.',
        'validation',
      );
    }
    filters[field] = Number(value);
  }
  const accountIds = accountId ? [accountId] : selected.length ? selected : (defaultAccounts ?? []);
  const filterValues = financeQueryFiltersSchema.parse(filters);
  return {
    query: accountIds.length
      ? financeQueryStartSchema.parse({ accountIds, filters: filterValues })
      : undefined,
    page: financeQueryPageSchema.parse({ limit: params.get('limit') ?? undefined }),
  };
}

export async function browseFinanceTransactions(
  runtime: TransactionQueryRuntime,
  context: { userId: string; securityRevision: number },
  input: ReturnType<typeof parseTransactionBrowseRequest>,
) {
  if (!input.query) {
    return {
      items: [],
      asOf: new Date().toISOString(),
      projectionRevision: 'empty-account-scope',
      complete: true,
      rowsState: 'confirmed-empty' as const,
      aggregateState: 'exact' as const,
      totalCount: 0,
      totalsByCurrency: [],
      coverage: { examined: 0, scopeComplete: true },
    };
  }
  const id = await runtime.start(context.userId, context.securityRevision, input.query);
  return runtime.page(context.userId, id, input.page);
}

export async function projectTransactionBudgetLinks(
  transaction: Record<string, unknown>,
  resolve: (
    itemId: string,
  ) => Promise<
    { status: 'visible'; budgetId: string; budgetName: string } | { status: 'missing' | 'hidden' }
  >,
) {
  if (!Array.isArray(transaction.allocations)) throw new Error('Invalid transaction allocations.');
  const budgets = new Map<string, string>();
  const allocations: unknown[] = [];
  let missingBudget = false;
  for (const allocation of transaction.allocations) {
    if (!allocation || typeof allocation !== 'object')
      throw new Error('Invalid transaction allocation.');
    if (typeof allocation.budgetItemId !== 'string') {
      allocations.push(allocation);
      continue;
    }
    const link = await resolve(allocation.budgetItemId);
    if (link.status === 'visible') {
      budgets.set(link.budgetId, link.budgetName);
      allocations.push(allocation);
    } else if (link.status === 'missing') {
      missingBudget = true;
    }
  }
  return {
    ...transaction,
    allocations,
    ...(allocations.length === transaction.allocations.length ? {} : { canEditAllocations: false }),
    budgetLinks: [...budgets].map(([id, name]) => ({ id, name })),
    ...(missingBudget ? { missingBudget } : {}),
  };
}
