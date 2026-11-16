import { financeQueryEnvelopeSchema } from '@naaseh/contracts';
import { financeRequest } from '../finance-client.js';
import { waitForTransactionQuery } from '../transactions/transaction-query.js';

export function startDashboardQuery(
  accountIds: string[],
  filters: object,
  csrfToken: string,
  signal: AbortSignal,
) {
  return financeRequest<{ queryId: string }>('/finance/queries', {
    method: 'POST',
    csrfToken,
    idempotencyKey: crypto.randomUUID(),
    signal,
    body: JSON.stringify({ accountIds, filters }),
  });
}

export async function finishDashboardQuery(
  id: string,
  signal: AbortSignal,
  kind: 'totals' | 'recent',
) {
  const path =
    '/finance/queries/' +
    encodeURIComponent(id) +
    (kind === 'totals' ? '?totalsOnly=1' : '/rows?limit=10');
  const deadline = Date.now() + 15_000;
  for (;;) {
    const result = financeQueryEnvelopeSchema.parse(await financeRequest(path, { signal }));
    if (kind === 'totals' ? result.aggregateState === 'exact' : result.rowsState !== 'searching')
      return result;
    if (result.aggregateState === 'failed' || Date.now() >= deadline)
      throw new Error('Finance results are incomplete.');
    await waitForTransactionQuery(signal);
  }
}

/** Limit concurrent job starts and polling together so views do not flood the API. */
export async function dashboardBatch<T, R>(inputs: readonly T[], action: (input: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < inputs.length; index += 4)
    results.push(...(await Promise.all(inputs.slice(index, index + 4).map(action))));
  return results;
}
