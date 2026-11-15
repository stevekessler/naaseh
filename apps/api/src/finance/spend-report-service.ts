import {
  financeQueryPageSchema,
  financeQueryStartSchema,
  parseSpendReportFilters,
} from '@naaseh/contracts';
import { SafeApiError } from '../shared/http.js';
import type { createFinanceQueryRuntime } from './query-runtime.js';

type Runtime = Pick<ReturnType<typeof createFinanceQueryRuntime>, 'start' | 'page'>;

export function parseSpendReportRequest(
  rawQuery: string,
  availableAccounts: string[],
  now = new Date(),
) {
  const params = new URLSearchParams(rawQuery);
  if (params.has('cursor') || params.has('queryId'))
    throw new SafeApiError(
      400,
      'finance_report_cursor_invalid',
      'Restart the report or use its saved page cursor.',
      'validation',
    );
  const filters = parseSpendReportFilters(params, now);
  const accountIds = filters.accountIds ?? [...new Set(availableAccounts)].sort();
  const available = new Set(availableAccounts);
  if (accountIds.some((id) => !available.has(id)))
    throw new SafeApiError(
      404,
      'finance_report_scope_missing',
      'A selected account is unavailable. Refresh the report.',
      'authorization',
    );
  return {
    now,
    query: accountIds.length
      ? financeQueryStartSchema.parse({ accountIds, filters: { ...filters, accountIds } })
      : undefined,
    page: financeQueryPageSchema.parse({ limit: params.get('limit') ?? undefined }),
  };
}

export async function browseFinanceSpendReport(
  runtime: Runtime,
  context: { userId: string; securityRevision: number },
  request: ReturnType<typeof parseSpendReportRequest>,
) {
  if (request.query) {
    const id = await runtime.start(context.userId, context.securityRevision, request.query);
    return runtime.page(context.userId, id, request.page);
  }
  return {
    items: [],
    asOf: request.now.toISOString(),
    projectionRevision: 'empty-report-scope',
    complete: true,
    rowsState: 'confirmed-empty' as const,
    aggregateState: 'exact' as const,
    coverage: { examined: 0, scopeComplete: true },
    totalCount: 0,
    totalsByCurrency: [],
  };
}
