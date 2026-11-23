import { useCallback } from 'react';
import {
  financeDashboardBudgetResponseSchema,
  financeDashboardPreferencesResponseSchema,
} from '@naaseh/contracts';
import { localFinanceDate, summarizeDashboardBudget } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { dashboardBatch, finishDashboardQuery, startDashboardQuery } from './dashboard-query.js';
import { BudgetForecast } from '../budgets/BudgetForecast.js';
import { dashboardMoney } from './dashboard-money.js';
import { useDashboardQuery } from './use-dashboard-query.js';

export function BudgetStatusWidget({
  ids,
  ownerId,
  csrfToken,
  onOpenBudget,
}: {
  ids: readonly string[];
  ownerId: string;
  csrfToken: string;
  onOpenBudget: (id: string) => void;
}) {
  const key = [...ids].sort().join(',');
  const load = useCallback(
    async (signal: AbortSignal) => {
      if (!key) return [];
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const today = localFinanceDate(new Date().toISOString(), timeZone);
      return dashboardBatch(key.split(','), async (id) => {
        const budget = financeDashboardBudgetResponseSchema.parse(
          await financeRequest('/finance/dashboard/budgets/' + encodeURIComponent(id), { signal }),
        );
        if (!budget) return null;
        const end = budget.endDate ?? today;
        const queryEnd = end < today ? end : today;
        const totals =
          budget.items.length && budget.accountIds.length && budget.startDate <= queryEnd
            ? await startDashboardQuery(
                budget.accountIds,
                {
                  postedSpendOnly: true,
                  budgetIds: [budget.id],
                  budgetItemIds: budget.items.map((item) => item.id),
                  dateFrom: budget.startDate,
                  dateTo: queryEnd,
                  timeZone,
                },
                csrfToken,
                signal,
              ).then(({ queryId }) => finishDashboardQuery(queryId, signal, 'totals'))
            : undefined;
        if (totals && !totals.totalsByCurrency) throw new Error('Budget totals are incomplete.');
        return {
          ...budget,
          end,
          totals: summarizeDashboardBudget(budget.items, totals?.totalsByCurrency ?? []),
        };
      });
    },
    [csrfToken, key],
  );
  const data = useDashboardQuery(key, load);
  const budgets = data.value?.filter((budget) => budget !== null) ?? [];
  return (
    <section aria-label="Dashboard budgets" className="finance-dashboard-widget">
      <h3>Open budgets</h3>
      {!key ? (
        <p>Choose budgets to include from their Finance detail pages.</p>
      ) : data.status === 'loading' ? (
        <p role="status">Checking open budgets…</p>
      ) : data.status === 'unavailable' ? (
        <>
          <p>Budget status is unavailable.</p>
          <button type="button" onClick={data.retry}>
            Retry budgets
          </button>
        </>
      ) : !budgets.length ? (
        <p>No open budgets among your selections.</p>
      ) : (
        budgets.map((budget) => (
          <article key={budget.id}>
            <h4>{budget.name}</h4>
            <p>
              {budget.startDate} through {budget.end}
              {!budget.endDate ? ' (through today)' : ''}
            </p>
            {!budget.complete && <p>Partial totals for the sources you can access.</p>}
            {!budget.totals.length && <p>No visible budget amounts.</p>}
            {budget.totals.map((total) => (
              <dl key={total.currency} aria-label={total.currency + ' budget totals'}>
                <dt>Planned expenses</dt>
                <dd>
                  {dashboardMoney(total.plannedMinor, total.currency, total.currencyExponent)}
                </dd>
                <dt>Spent</dt>
                <dd>{dashboardMoney(total.spentMinor, total.currency, total.currencyExponent)}</dd>
                <dt>Percent used</dt>
                <dd>
                  {total.percentUsed === null
                    ? 'Not applicable'
                    : new Intl.NumberFormat(undefined, {
                        style: 'percent',
                        maximumFractionDigits: 1,
                      }).format(total.percentUsed / 100)}
                </dd>
                <dt>{total.remainingMinor < 0 ? 'Overspent' : 'Left to spend'}</dt>
                <dd>
                  {dashboardMoney(total.remainingMinor, total.currency, total.currencyExponent)}
                </dd>
              </dl>
            ))}
            <details>
              <summary>Forecast for {budget.name}</summary>
              <BudgetForecast
                budgetId={budget.id}
                ownerId={ownerId}
                csrfToken={csrfToken}
                overview
                verifyAccess={async () => {
                  const preferences = financeDashboardPreferencesResponseSchema.parse(
                    await financeRequest('/finance/dashboard-preferences'),
                  );
                  return preferences.flags.some(
                    (flag) =>
                      flag.targetKind === 'budget' && flag.targetId === budget.id && flag.included,
                  );
                }}
              />
            </details>
            <button type="button" onClick={() => onOpenBudget(budget.id)}>
              Open budget
            </button>
          </article>
        ))
      )}
    </section>
  );
}
