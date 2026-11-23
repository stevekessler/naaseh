import { useCallback, useState } from 'react';
import { financeTrendModes, financeTrendPeriods, type FinanceTrendMode } from '@naaseh/domain';
import type { FinanceDashboardAccount } from './AccountBalancesWidget.js';
import { dashboardMoney } from './dashboard-money.js';
import { readCachedSpendTrend, readSpendTrend, type TrendPeriod } from './spend-trends-query.js';
import { useDashboardQuery } from './use-dashboard-query.js';

const labels = { month: '12 months', quarter: '8 quarters', year: '5 years' };

function CurrencyTrend({
  currency,
  exponent,
  periods,
  values,
}: {
  currency: string;
  exponent: number;
  periods: TrendPeriod[];
  values: number[];
}) {
  const min = Math.min(0, ...values);
  const span = Math.max(0, ...values) - min || 1;
  const x = (index: number) => 14 + index * (572 / Math.max(values.length - 1, 1));
  const y = (value: number) => 130 - ((value - min) * 116) / span;
  return (
    <section aria-label={currency + ' spending trend'}>
      <h4>{currency}</h4>
      <svg
        viewBox="0 0 600 144"
        role="img"
        aria-label={currency + ' net spending by period'}
        className="finance-trend-graph"
      >
        <line x1="14" x2="586" y1={y(0)} y2={y(0)} stroke="currentColor" opacity=".35" />
        <polyline
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          points={values.map((value, index) => `${x(index)},${y(value)}`).join(' ')}
        />
        {values.map((value, index) => (
          <circle key={index} cx={x(index)} cy={y(value)} r="3" fill="currentColor" />
        ))}
      </svg>
      <table>
        <caption>{currency} net spending by period</caption>
        <thead>
          <tr>
            <th scope="col">Period</th>
            <th scope="col">Net spending</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((period, index) => (
            <tr key={period.dateFrom}>
              <th scope="row">
                {period.label}
                {period.partial ? ' (in progress)' : ''}
              </th>
              <td>{dashboardMoney(values[index] ?? 0, currency, exponent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function SpendTrendsWidget({
  accounts,
  accountsStatus,
  csrfToken,
}: {
  accounts: FinanceDashboardAccount[];
  accountsStatus: string;
  csrfToken: string;
}) {
  const [mode, setMode] = useState<FinanceTrendMode>('month');
  const [selected, setSelected] = useState<string[] | null>(null);
  const allIds = accounts
    .map(({ id }) => id)
    .sort()
    .join(',');
  const selectedIds = selected === null ? '*' : [...selected].sort().join(',');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const load = useCallback(
    async (signal: AbortSignal) => {
      const periods = financeTrendPeriods(mode, timeZone, new Date().toISOString());
      const requested = selectedIds === '*' ? null : selectedIds ? selectedIds.split(',') : [];
      if (!navigator.onLine) {
        const cached = await readCachedSpendTrend(periods, timeZone, requested, signal);
        return { ...cached, periods, cached: true };
      }
      if (accountsStatus !== 'ready') throw new Error('Account scope is unavailable.');
      const ids = allIds ? allIds.split(',') : [];
      const scope = requested === null ? ids : ids.filter((id) => requested.includes(id));
      const totals = scope.length
        ? await readSpendTrend(mode, timeZone, periods, scope, csrfToken, signal)
        : [];
      return { selected: scope, totals, periods, cached: false, options: undefined };
    },
    [mode, timeZone, selectedIds, allIds, accountsStatus, csrfToken],
  );
  const data = useDashboardQuery(
    [mode, timeZone, selectedIds, allIds, accountsStatus].join(':'),
    load,
  );
  const options = data.value?.options ?? accounts;
  const active = data.value?.selected ?? selected ?? options.map(({ id }) => id);
  const currencies = new Map<string, number>(
    options
      .filter(({ id }) => active.includes(id))
      .map(({ currency, currencyExponent }) => [currency, currencyExponent]),
  );
  for (const total of data.value?.totals.flat() ?? [])
    currencies.set(total.currency, total.currencyExponent);
  return (
    <section aria-label="Spending trends" className="finance-dashboard-widget">
      <h3>Spending trends</h3>
      <label>
        Period{' '}
        <select value={mode} onChange={(event) => setMode(event.target.value as FinanceTrendMode)}>
          {financeTrendModes.map((value) => (
            <option key={value} value={value}>
              {labels[value]}
            </option>
          ))}
        </select>
      </label>
      {options.length > 0 && (
        <fieldset>
          <legend>Spending accounts</legend>
          <label>
            <input
              type="checkbox"
              checked={selected === null}
              onChange={(event) => setSelected(event.target.checked ? null : [])}
            />{' '}
            All accessible accounts
          </label>
          {options.map((account) => (
            <label key={account.id}>
              <input
                type="checkbox"
                checked={active.includes(account.id)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...new Set([...active, account.id])]
                      : active.filter((id) => id !== account.id),
                  )
                }
              />{' '}
              {account.friendlyName}
            </label>
          ))}
        </fieldset>
      )}
      <p>{timeZone}</p>
      {data.status === 'loading' ? (
        <p role="status">Calculating spending trends…</p>
      ) : data.status === 'unavailable' ? (
        <>
          <p>Spending trends are unavailable or incomplete.</p>
          <button type="button" onClick={data.retry}>
            Retry spending trends
          </button>
        </>
      ) : !data.value?.selected.length ? (
        <p>No accessible accounts in this selection.</p>
      ) : (
        <>
          <p>
            {data.value.cached
              ? 'Partial offline data from this device. A zero does not confirm no activity.'
              : 'Posted spending after linked refunds. The current period is still in progress.'}
          </p>
          {[...currencies]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, exponent]) => (
              <CurrencyTrend
                key={currency}
                currency={currency}
                exponent={exponent}
                periods={data.value!.periods}
                values={data.value!.totals.map(
                  (totals) => totals.find((total) => total.currency === currency)?.amountMinor ?? 0,
                )}
              />
            ))}
        </>
      )}
    </section>
  );
}
