import { useCallback } from 'react';
import { z } from 'zod';
import { dashboardMoney } from './BudgetStatusWidget.js';
import { dashboardBatch, finishDashboardQuery, startDashboardQuery } from './dashboard-query.js';
import { useDashboardQuery } from './use-dashboard-query.js';

const rowSchema = z.object({
  id: z.string(),
  description: z.string(),
  effectiveAt: z.iso.datetime(),
  amountMinor: z.number().int().safe(),
  currency: z.string(),
  currencyExponent: z.number().int().min(0).max(4),
});

export function RecentActivityWidget({
  kind,
  ids,
  accountIds,
  accountsStatus,
  csrfToken,
  onOpenTransaction,
}: {
  kind: 'category' | 'merchant';
  ids: readonly string[];
  accountIds: readonly string[];
  accountsStatus: 'checking' | 'ready' | 'unavailable';
  csrfToken: string;
  onOpenTransaction: (id: string, focusId?: string) => void;
}) {
  const key = [...ids].sort().join(',');
  const accounts = [...accountIds].sort().join(',');
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (accountsStatus !== 'ready') return [];
      if (!key || !accounts) return [];
      const flagIds = key.split(',');
      const dimension = kind === 'merchant' ? 'merchantIds' : 'dashboardCategoryIds';
      const filters = Array.from({ length: Math.ceil(flagIds.length / 50) }, (_, index) => ({
        [dimension]: flagIds.slice(index * 50, (index + 1) * 50),
      }));
      const results = await dashboardBatch(filters, async (filter) => {
        const { queryId } = await startDashboardQuery(
          accounts.split(','),
          filter,
          csrfToken,
          signal,
        );
        return finishDashboardQuery(queryId, signal, 'recent');
      });
      const rows = z.array(rowSchema).parse(results.flatMap((result) => result.items));
      return [...new Map(rows.map((row) => [row.id, row])).values()]
        .sort(
          (a, b) =>
            Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.id.localeCompare(a.id),
        )
        .slice(0, 10);
    },
    [accounts, accountsStatus, csrfToken, key, kind],
  );
  const data = useDashboardQuery(key + ':' + accounts + ':' + accountsStatus, load);
  const label = kind === 'merchant' ? 'Recent merchant activity' : 'Recent category activity';
  return (
    <section aria-label={label} className="finance-dashboard-widget">
      <h3>{label}</h3>
      {!key ? (
        <p>Choose {kind === 'merchant' ? 'merchants' : 'categories'} to include in Finance.</p>
      ) : accountsStatus === 'checking' || data.status === 'loading' ? (
        <p role="status">Checking recent activity…</p>
      ) : accountsStatus === 'unavailable' || data.status === 'unavailable' ? (
        <>
          <p>Recent activity is unavailable.</p>
          {accountsStatus === 'ready' && (
            <button type="button" onClick={data.retry}>
              Retry recent activity
            </button>
          )}
        </>
      ) : !data.value?.length ? (
        <p>No matching transactions.</p>
      ) : (
        <ul>
          {data.value.map((row) => {
            const focusId = `dashboard-${kind}-${row.id}`;
            return (
              <li key={row.id}>
                <a
                  id={focusId}
                  href={`/finance/transactions/${encodeURIComponent(row.id)}`}
                  onClick={(event) => {
                    if (
                      event.button ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.altKey ||
                      event.shiftKey
                    )
                      return;
                    event.preventDefault();
                    onOpenTransaction(row.id, focusId);
                  }}
                >
                  {row.description}
                </a>
                {' · '}
                {new Date(row.effectiveAt).toLocaleDateString()}
                {' · '}
                {dashboardMoney(row.amountMinor, row.currency, row.currencyExponent)}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
