import { type FormEvent, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { financeForecastRequestSchema, financeForecastResultSchema } from '@naaseh/contracts';
import type { z } from 'zod';
import { dashboardMoney } from '../dashboard/dashboard-money.js';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess, subscribeFinanceAccess } from '../security/finance-access.js';

type Forecast = z.infer<typeof financeForecastResultSchema>;
const readableAccess = () => {
  const access = peekFinanceAccess();
  return access?.canRead() ? access : undefined;
};

type ForecastView =
  | { state: 'idle' | 'loading' | 'unavailable' }
  | { state: 'ready'; data: Forecast };

export function BudgetForecast({
  budgetId,
  ownerId,
  csrfToken,
  verifyAccess,
  overview = false,
}: {
  budgetId: string;
  ownerId: string;
  csrfToken: string;
  verifyAccess: () => Promise<boolean>;
  overview?: boolean;
}) {
  const access = useSyncExternalStore(subscribeFinanceAccess, readableAccess, () => undefined);
  const [method, setMethod] = useState<'known-plan' | 'historical'>('known-plan');
  const [includeHistory, setIncludeHistory] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [online, setOnline] = useState(() => navigator.onLine);
  const [view, setView] = useState<ForecastView>({ state: 'idle' });
  const [dateError, setDateError] = useState(false);
  const active = useRef<AbortController | undefined>(undefined);

  const clear = () => {
    active.current?.abort();
    active.current = undefined;
    setView({ state: 'idle' });
    setDateError(false);
  };
  useEffect(() => {
    const reset = () => {
      clear();
      setIncludeHistory(false);
    };
    reset();
    const connectionChanged = () => {
      setOnline(navigator.onLine);
      reset();
    };
    const stop = access?.onLock(reset);
    window.addEventListener('online', connectionChanged);
    window.addEventListener('offline', connectionChanged);
    window.addEventListener('focus', reset);
    return () => {
      stop?.();
      active.current?.abort();
      active.current = undefined;
      window.removeEventListener('online', connectionChanged);
      window.removeEventListener('offline', connectionChanged);
      window.removeEventListener('focus', reset);
    };
  }, [access, budgetId, ownerId]);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    clear();
    if (!access || access.ownerId !== ownerId || !navigator.onLine) return;
    const parsed = financeForecastRequestSchema.safeParse({
      method,
      includeNonBudgetedHistory: !overview && method === 'historical' && includeHistory,
      ...(dateFrom ? { dateFrom } : {}),
      ...(dateTo ? { dateTo } : {}),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    if (!parsed.success) {
      setDateError(true);
      return;
    }
    const controller = new AbortController();
    const { signal } = controller;
    active.current = controller;
    const current = () => !signal.aborted && readableAccess() === access && navigator.onLine;
    setView({ state: 'loading' });
    try {
      if (!(await verifyAccess())) throw new Error('Finance source access changed.');
      if (!current()) return;
      const request = parsed.data;
      const result = financeForecastResultSchema.parse(
        await financeRequest('/finance/budgets/' + encodeURIComponent(budgetId) + '/forecast', {
          method: 'POST',
          body: JSON.stringify(request),
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          signal,
        }),
      );
      if (!current()) return;
      if (
        result.budgetId !== budgetId ||
        result.method !== request.method ||
        result.includeNonBudgetedHistory !== request.includeNonBudgetedHistory ||
        result.timeZone !== request.timeZone ||
        (request.dateFrom &&
          (result.window.dateFrom !== request.dateFrom ||
            result.window.dateTo !== request.dateTo)) ||
        !(await verifyAccess())
      )
        throw new Error('Finance forecast source changed.');
      if (current()) setView({ state: 'ready', data: result });
    } catch {
      if (current()) setView({ state: 'unavailable' });
    }
  }

  if (!access || access.ownerId !== ownerId) return null;
  return (
    <section aria-label="Budget forecast">
      <h3>Budget forecast</h3>
      {!online && <p role="status">Reconnect to run a forecast with current Finance records.</p>}
      <form onSubmit={(event) => void run(event)}>
        <fieldset
          className="finance-forecast-options"
          disabled={!online || view.state === 'loading'}
        >
          <legend>Forecast options</legend>
          <label>
            Forecast method
            <select
              value={method}
              onChange={(event) => {
                clear();
                setIncludeHistory(false);
                setMethod(event.currentTarget.value === 'historical' ? 'historical' : 'known-plan');
              }}
            >
              <option value="known-plan">Known plan</option>
              <option value="historical">History-based estimate</option>
            </select>
          </label>
          {!overview && (
            <>
              <label>
                Forecast start date
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(event) => {
                    clear();
                    setDateFrom(event.currentTarget.value);
                  }}
                />
              </label>
              <label>
                Forecast end date
                <input
                  type="date"
                  value={dateTo}
                  onChange={(event) => {
                    clear();
                    setDateTo(event.currentTarget.value);
                  }}
                />
              </label>
            </>
          )}
          {!overview && method === 'historical' && (
            <label>
              <input
                type="checkbox"
                checked={includeHistory}
                onChange={(event) => {
                  clear();
                  setIncludeHistory(event.currentTarget.checked);
                }}
              />
              Include non-budgeted history from linked accounts
            </label>
          )}
          <button type="submit">Run forecast</button>
        </fieldset>
      </form>
      {dateError && (
        <p role="alert">Enter both dates in order or leave them blank to use the default period.</p>
      )}
      {view.state === 'loading' && <p role="status">Calculating forecast…</p>}
      {view.state === 'unavailable' && (
        <p role="alert">The forecast is unavailable. Try running it again.</p>
      )}
      {view.state === 'ready' && online && <ForecastResult result={view.data} />}
    </section>
  );
}

function ForecastResult({ result }: { result: Forecast }) {
  return (
    <section aria-label="Forecast results">
      <h4>{result.method === 'historical' ? 'History-based estimate' : 'Known-plan forecast'}</h4>
      <p>
        {result.window.dateFrom} through {result.window.dateTo}
      </p>
      <p>Source checked {new Date(result.sourceAsOf).toLocaleString()}</p>
      {result.coverage === 'partial' && <p>Partial coverage. Some source data is unavailable.</p>}
      {result.method === 'historical' && (
        <p>
          {result.observed.coveredMonths} of 6 history months covered ({result.observed.dateFrom}{' '}
          through {result.observed.dateTo}).
        </p>
      )}
      {result.status === 'insufficient-history' && (
        <p>Insufficient history to estimate future activity.</p>
      )}
      {!result.currencies.length && result.status === 'ready' && (
        <p>No forecast amounts are available for this period.</p>
      )}
      {result.currencies.map(({ currency, currencyExponent, actual, remaining, projected }) => (
        <div className="finance-forecast-table" key={currency}>
          <table>
            <caption>{currency} forecast amounts</caption>
            <thead>
              <tr>
                <th scope="col">Period</th>
                <th scope="col">Income</th>
                <th scope="col">Expenses</th>
                <th scope="col">Net</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Actual', actual],
                  ['Remaining', remaining],
                  ['Projected', projected],
                ] as const
              ).map(
                ([label, amounts]) =>
                  amounts && (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{dashboardMoney(amounts.incomeMinor, currency, currencyExponent)}</td>
                      <td>{dashboardMoney(amounts.expenseMinor, currency, currencyExponent)}</td>
                      <td>{dashboardMoney(amounts.netMinor, currency, currencyExponent)}</td>
                    </tr>
                  ),
              )}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
