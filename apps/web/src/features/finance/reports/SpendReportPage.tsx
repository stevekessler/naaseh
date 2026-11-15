import { useEffect, useRef, useState } from 'react';
import {
  parseSpendReportFilters,
  spendReportDimensions,
  spendReportMonth,
} from '@naaseh/contracts';
import { addMinorUnits, filterSpendSlices } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import { waitForTransactionQuery } from '../transactions/transaction-query.js';
import {
  readCachedSpendReport,
  requestSpendReport,
  type ReportPage,
  type ReportRow,
} from './spend-report-query.js';

const endpoint = '/finance/reports/spend';
const dimensions = {
  accountIds: 'Accounts',
  budgetIds: 'Budgets',
  merchantIds: 'Merchants',
  categoryIds: 'Categories',
  subcategoryIds: 'Subcategories',
};
type Catalog = Record<(typeof spendReportDimensions)[number], { id: string; name: string }[]>;
const emptyCatalog: Catalog = {
  accountIds: [],
  budgetIds: [],
  merchantIds: [],
  categoryIds: [],
  subcategoryIds: [],
};
const emptySelection = {
  accountIds: [],
  budgetIds: [],
  merchantIds: [],
  categoryIds: [],
  subcategoryIds: [],
};
const money = (currency: string, exponent: number, minor: number) =>
  new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);

async function loadCatalog(signal: AbortSignal): Promise<Catalog> {
  const options = { signal, headers: { 'x-finance-browse': '1' } };
  const [accounts, budgets, merchants, categories] = await Promise.all([
    financeRequest<{ items: { id: string; friendlyName: string }[] }>('/finance/accounts', options),
    financeRequest<{ items: Catalog['budgetIds'] }>('/finance/budgets', options),
    financeRequest<{ items: Catalog['merchantIds'] }>('/finance/merchants', options),
    financeRequest<{ items: { id: string; name: string; parentId?: string }[] }>(
      '/finance/categories',
      options,
    ),
  ]);
  return {
    accountIds: accounts.items.map(({ id, friendlyName }) => ({ id, name: friendlyName })),
    budgetIds: budgets.items,
    merchantIds: merchants.items,
    categoryIds: categories.items.filter(({ parentId }) => !parentId),
    subcategoryIds: categories.items.filter(({ parentId }) => parentId),
  };
}

export function SpendReportPage({
  onOpenTransaction,
}: {
  onOpenTransaction: (id: string, focusId?: string) => void;
}) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const [selected, setSelected] = useState<Record<keyof Catalog, string[]>>(emptySelection);
  const [dates, setDates] = useState(() => ({ date: '', ...spendReportMonth(zone) }));
  const [catalog, setCatalog] = useState<Catalog>(emptyCatalog);
  const [catalogError, setCatalogError] = useState(false);
  const [connected, setConnected] = useState(() => navigator.onLine);
  const [reload, setReload] = useState(0);
  const [loadedPage, setPage] = useState<ReportPage>();
  const [loadedCache, setCached] = useState<Awaited<ReturnType<typeof readCachedSpendReport>>>();
  const [loadedScope, setLoadedScope] = useState<string>();
  const [busy, setBusy] = useState(true);
  const [paging, setPaging] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | undefined>(undefined);
  const params = new URLSearchParams({ timeZone: zone });
  for (const [key, value] of Object.entries(dates)) if (value) params.set(key, value);
  for (const key of spendReportDimensions) for (const id of selected[key]) params.append(key, id);
  const query = params.toString();
  const scope = JSON.stringify([connected, query, reload]);
  const page = loadedScope === scope ? loadedPage : undefined;
  const cached = loadedScope === scope ? loadedCache : undefined;

  useEffect(() => {
    const change = () => setConnected(navigator.onLine);
    window.addEventListener('online', change);
    window.addEventListener('offline', change);
    return () => {
      window.removeEventListener('online', change);
      window.removeEventListener('offline', change);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      controller.abort();
      setCatalog(emptyCatalog);
    });
    if (connected)
      void loadCatalog(controller.signal)
        .then((value) => {
          if (!controller.signal.aborted) {
            setCatalog(value);
            setCatalogError(false);
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setCatalogError(true);
        });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [connected, reload]);

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    const { signal } = controller;
    const clear = () => {
      setPage(undefined);
      setCached(undefined);
      setPaging(false);
    };
    clear();
    setLoadedScope(scope);
    setError('');
    setBusy(true);
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      controller.abort();
      clear();
      setSelected(emptySelection);
      setError('');
      setBusy(false);
    });
    void (async () => {
      parseSpendReportFilters(new URLSearchParams(query));
      if (!connected) {
        const result = await readCachedSpendReport(query, signal);
        signal.throwIfAborted();
        setCached(result);
        setCatalog(result.catalog);
        return;
      }
      let result = await requestSpendReport(endpoint + '?' + query, signal);
      for (let attempts = 0; ; attempts++) {
        signal.throwIfAborted();
        setPage(result);
        if (result.aggregateState === 'exact') return;
        if (result.aggregateState === 'failed' || !result.queryId || attempts >= 40) {
          setError('Exact totals are unavailable. Refresh the report to try again.');
          return;
        }
        await waitForTransactionQuery(signal);
        const next = await requestSpendReport(
          '/finance/queries/' + encodeURIComponent(result.queryId) + '/rows',
          signal,
        );
        if (
          next.projectionRevision !== result.projectionRevision ||
          next.queryId !== result.queryId
        )
          throw new Error('Report source changed.');
        result = next;
      }
    })()
      .catch(() => {
        if (signal.aborted) return;
        clear();
        setError(
          connected
            ? 'The report could not be loaded. Check the dates or refresh Finance.'
            : 'Reconnect to refresh the saved Finance records for this report.',
        );
      })
      .finally(() => {
        if (!signal.aborted) setBusy(false);
      });
    return () => {
      controller.abort();
      unsubscribe?.();
    };
  }, [connected, query, scope]);

  async function loadMore() {
    const signal = request.current?.signal;
    if (!signal || !page?.queryId || !page.nextCursor || paging) return;
    setPaging(true);
    try {
      const path = '/finance/queries/' + encodeURIComponent(page.queryId) + '/rows?';
      const search = new URLSearchParams({ cursor: page.nextCursor });
      let next = await requestSpendReport(path + search, signal);
      for (let attempt = 0; next.rowsState === 'searching' && attempt < 30; attempt++) {
        await waitForTransactionQuery(signal);
        next = await requestSpendReport(path + search, signal);
      }
      signal.throwIfAborted();
      if (next.projectionRevision !== page.projectionRevision || next.queryId !== page.queryId)
        throw new Error('Report source changed.');
      if (next.rowsState === 'searching') {
        setError('More transactions are still being prepared. Try again.');
        return;
      }
      setPage({
        ...next,
        items: [...new Map([...page.items, ...next.items].map((row) => [row.id, row])).values()],
      });
      setError('');
    } catch {
      if (!signal.aborted) {
        setPage(undefined);
        setError('The report changed. Refresh to continue.');
      }
    } finally {
      if (!signal.aborted) setPaging(false);
    }
  }

  const rows: ReportRow[] = cached?.rows ?? page?.items ?? [];
  const totals = cached?.totals ?? page?.totalsByCurrency ?? [];
  let filters: ReturnType<typeof parseSpendReportFilters> | undefined;
  try {
    filters = parseSpendReportFilters(params);
  } catch {
    /* Invalid dates withhold results. */
  }

  return (
    <section aria-labelledby="finance-spend-report">
      <h2 id="finance-spend-report">Spend report</h2>
      <p>Posted expenses and linked refunds by transaction date. {zone}</p>
      {filters ? (
        <p>
          {filters.date ??
            (filters.dateFrom && filters.dateTo
              ? filters.dateFrom + ' through ' + filters.dateTo
              : filters.dateFrom
                ? 'From ' + filters.dateFrom
                : 'Through ' + filters.dateTo)}
        </p>
      ) : null}
      <fieldset className="finance-spend-filters">
        <legend>Spend filters</legend>
        <label>
          Transaction date
          <input
            type="date"
            value={dates.date}
            onChange={(event) => {
              const date = event.target.value;
              setDates(
                date ? { date, dateFrom: '', dateTo: '' } : { date: '', ...spendReportMonth(zone) },
              );
            }}
          />
        </label>
        <label>
          From transaction date
          <input
            type="date"
            value={dates.dateFrom}
            onChange={(event) => setDates({ ...dates, date: '', dateFrom: event.target.value })}
          />
        </label>
        <label>
          To transaction date
          <input
            type="date"
            value={dates.dateTo}
            onChange={(event) => setDates({ ...dates, date: '', dateTo: event.target.value })}
          />
        </label>
        {spendReportDimensions.map((key) => (
          <label key={key}>
            {dimensions[key]}
            <select
              multiple
              size={Math.min(4, Math.max(2, catalog[key].length))}
              value={selected[key]}
              onChange={(event) =>
                setSelected({
                  ...selected,
                  [key]: Array.from(event.currentTarget.selectedOptions, ({ value }) => value),
                })
              }
            >
              {catalog[key].map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <button
          type="button"
          onClick={() => {
            setSelected(emptySelection);
            setDates({ date: '', ...spendReportMonth(zone) });
          }}
        >
          Clear filters
        </button>
        <button type="button" onClick={() => setReload((value) => value + 1)}>
          Refresh report
        </button>
      </fieldset>
      {catalogError && connected ? (
        <p role="status">Some filter choices are unavailable. Refresh to try again.</p>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      {busy && !rows.length ? <p role="status">Finding matching transactions…</p> : null}
      {page?.aggregateState === 'pending' ? (
        <p role="status">Exact count and totals are being calculated.</p>
      ) : null}
      {!connected ? (
        <p role="status">
          {cached
            ? `Offline · Partial coverage from ${cached.examined} saved ${cached.examined === 1 ? 'transaction' : 'transactions'}.`
            : 'Offline · Loading saved Finance data.'}
        </p>
      ) : null}
      {cached?.lastCachedChange ? (
        <p>Last cached change {new Date(cached.lastCachedChange).toLocaleString()}</p>
      ) : null}
      {page?.rowsState === 'confirmed-empty' ? <p>No matching transactions.</p> : null}
      {cached && !rows.length ? <p>No matching transactions in saved data.</p> : null}
      {page?.aggregateState === 'exact' ? (
        <p>
          {page.totalCount} matching {page.totalCount === 1 ? 'transaction' : 'transactions'}
        </p>
      ) : null}
      {totals.length ? (
        <section aria-label={cached ? 'Partial cached net spending' : 'Net spending'}>
          <h3>{cached ? 'Partial cached net spending' : 'Net spending'}</h3>
          <ul>
            {totals.map((total) => (
              <li key={total.currency}>
                {money(total.currency, total.currencyExponent, total.amountMinor)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rows.length && filters ? (
        <div
          className="finance-spend-table"
          tabIndex={0}
          role="region"
          aria-label="Matching transactions"
        >
          <table>
            <thead>
              <tr>
                <th>Transaction</th>
                <th>Date</th>
                <th>Matched net spend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const focusId = 'finance-spend-' + row.id;
                const slices = filterSpendSlices(row.slices ?? [], filters);
                return (
                  <tr key={row.id}>
                    <td>
                      <a
                        id={focusId}
                        href={'/finance/transactions/' + encodeURIComponent(row.id)}
                        onClick={(event) => {
                          if (
                            event.button !== 0 ||
                            event.altKey ||
                            event.metaKey ||
                            event.ctrlKey ||
                            event.shiftKey
                          )
                            return;
                          event.preventDefault();
                          onOpenTransaction(row.id, focusId);
                        }}
                      >
                        {row.description}
                      </a>
                    </td>
                    <td>
                      {row.effectiveAt
                        ? new Intl.DateTimeFormat(undefined, {
                            timeZone: zone,
                            dateStyle: 'medium',
                          }).format(new Date(row.effectiveAt))
                        : '—'}
                    </td>
                    <td>
                      {money(
                        row.currency,
                        row.currencyExponent,
                        row.matchedMinor ??
                          addMinorUnits(slices.map(({ amountMinor }) => amountMinor)),
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {page?.nextCursor && page.aggregateState === 'exact' ? (
        <button type="button" disabled={paging} onClick={() => void loadMore()}>
          {paging ? 'Loading more…' : 'Load more transactions'}
        </button>
      ) : null}
    </section>
  );
}
