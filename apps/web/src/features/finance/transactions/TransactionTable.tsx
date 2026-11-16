import { FinanceClientError } from '../finance-client.js';
import { useContext, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  TransactionFilterContext,
  type TransactionFilterState,
} from './transaction-filter-state.js';
import { TransactionFilters } from './TransactionFilters.js';
import {
  continueTransactionQuery,
  readCachedTransactionQuery,
  startTransactionQuery,
  transactionFilters,
  waitForTransactionQuery,
  type TransactionBrowseRow,
  type TransactionQueryPage,
} from './transaction-query.js';

type Account = { id: string; friendlyName: string; currency: string };
type OpenTransaction = (transactionId: string, focusId: string) => void;

function openRow(
  event: MouseEvent<HTMLAnchorElement>,
  row: TransactionBrowseRow,
  open?: OpenTransaction,
) {
  if (!open || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  open(row.id, event.currentTarget.id);
}

function mustClearResults(cause: unknown) {
  return cause instanceof FinanceClientError && [401, 403, 409].includes(cause.problem.status);
}

export function TransactionTable({
  accounts,
  accountId,
  categories = [],
  reload,
  scopeLoading,
  scopeError,
  onRefreshScope,
  onOpen,
  onOpenMerchant,
}: {
  accounts: readonly Account[];
  accountId?: string;
  categories?: ReadonlyArray<{ id: string; name: string }>;
  reload?: number;
  scopeLoading?: boolean;
  scopeError?: boolean;
  onRefreshScope?: () => void;
  onOpen?: OpenTransaction;
  onOpenMerchant?: (id: string) => void;
}) {
  const filterState = useContext(TransactionFilterContext);
  const filterKey = accountId ?? 'transactions';
  const [values, setValues] = useState(() => filterState?.get(filterKey)?.values ?? {});
  const [selected, setSelected] = useState<string[]>(
    () => filterState?.get(filterKey)?.accounts ?? [],
  );
  const saveFilters = (next: TransactionFilterState) => {
    filterState?.set(filterKey, next);
    setValues(next.values);
    setSelected(next.accounts);
  };
  const [page, setPage] = useState<TransactionQueryPage>();
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [cached, setCached] = useState<Awaited<ReturnType<typeof readCachedTransactionQuery>>>();
  const [cachedLimit, setCachedLimit] = useState(50);
  const [progress, setProgress] = useState<number>();
  const [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState(false);
  const paging = useRef<AbortController | undefined>(undefined);
  const accountIds = useMemo(
    () => (accountId ? [accountId] : accounts.map(({ id }) => id)),
    [accountId, accounts],
  );
  const ids =
    selected.length && !accountId
      ? selected.filter((id) => offline || accountIds.includes(id))
      : accountIds;
  const scope = ids.join(',');
  const currencies = [
    ...new Set(accounts.filter(({ id }) => ids.includes(id)).map(({ currency }) => currency)),
  ];
  const multipleCurrencies = currencies.length > 1;
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    window.addEventListener('offline', update);
    window.addEventListener('online', update);
    return () => {
      window.removeEventListener('offline', update);
      window.removeEventListener('online', update);
    };
  }, []);

  useEffect(() => {
    paging.current?.abort();
    paging.current = undefined;
    setPending(false);
    setPage(undefined);
    setCached(undefined);
    setCachedLimit(50);
    setProgress(undefined);
    setError('');
    if (!scope && !offline) return;
    const access = peekFinanceAccess();
    if (!access) return;
    const controller = new AbortController();
    const { signal } = controller;
    const lock = () => {
      controller.abort();
      setPage(undefined);
      setCached(undefined);
      setProgress(undefined);
      setError('');
      setValues({});
      setSelected([]);
    };
    const unsubscribe = access.onLock(lock);
    const load = async () => {
      const filters = transactionFilters(values, scope ? scope.split(',') : []);
      if (offline) {
        const result = await readCachedTransactionQuery(filters, signal, ({ indexed }) => {
          if (!signal.aborted) setProgress(indexed);
        });
        if (!signal.aborted) setCached(result);
        return;
      }
      if (
        multipleCurrencies &&
        !filters.currency &&
        (filters.amount !== undefined ||
          filters.amountMin !== undefined ||
          filters.amountMax !== undefined)
      ) {
        setError('Choose a currency to filter an amount across accounts.');
        return;
      }
      const started = performance.now();
      let result = await startTransactionQuery(filters, accountId, signal);
      let hasRows = false;
      while (!signal.aborted) {
        if (result.rowsState !== 'searching') hasRows = true;
        setPage(result);
        if (result.aggregateState !== 'pending' && hasRows) break;
        if (!result.queryId || performance.now() - started > 10_000) {
          setError(
            hasRows
              ? 'Exact totals are unavailable. Refresh to retry.'
              : 'Transaction results are unavailable. Refresh to retry.',
          );
          break;
        }
        await waitForTransactionQuery(signal);
        result = await continueTransactionQuery(result.queryId, signal);
      }
    };
    const timer = setTimeout(() => {
      void load().catch((cause: unknown) => {
        if (signal.aborted) return;
        if (mustClearResults(cause)) setPage(undefined);
        setError(
          offline
            ? 'Cached transactions are unavailable.'
            : 'Check the filters or refresh transactions to try again.',
        );
      });
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
      paging.current?.abort();
      unsubscribe();
    };
  }, [accountId, multipleCurrencies, offline, refresh, reload, scope, values]);

  const loadMore = async () => {
    if (!page?.queryId || !page.nextCursor || pending) return;
    const { queryId, nextCursor } = page;
    const controller = new AbortController();
    paging.current = controller;
    const unsubscribe = peekFinanceAccess()?.onLock(() => controller.abort());
    const started = performance.now();
    setPending(true);
    try {
      let next = await continueTransactionQuery(queryId, controller.signal, nextCursor);
      while (next.rowsState === 'searching' && performance.now() - started < 10_000) {
        await waitForTransactionQuery(controller.signal);
        next = await continueTransactionQuery(queryId, controller.signal, nextCursor);
      }
      if (next.rowsState === 'searching') throw new Error('Page unavailable.');
      setPage((current) =>
        current?.queryId === queryId && current.nextCursor === nextCursor
          ? { ...next, items: [...current.items, ...next.items] }
          : current,
      );
    } catch (cause) {
      if (!controller.signal.aborted) {
        if (mustClearResults(cause)) setPage(undefined);
        setError('More transactions are unavailable. Refresh to retry.');
      }
    } finally {
      unsubscribe?.();
      if (paging.current === controller) {
        paging.current = undefined;
        setPending(false);
      }
    }
  };

  const filtered = Object.values(values).some((value) => value.trim()) || selected.length > 0;
  const categoryName = (id: string | undefined) =>
    (cached?.categories ?? categories).find((category) => category.id === id)?.name;
  const visibleRows = cached ? cached.items.slice(0, cachedLimit) : (page?.items ?? []);
  const cachedMessage = cached
    ? `${cached.items.length} ${cached.items.length === 1 ? 'match' : 'matches'} among ${cached.examined} cached ${cached.examined === 1 ? 'transaction' : 'transactions'}. Coverage may be incomplete.`
    : `Checking saved transactions${progress === undefined ? '…' : ' (' + progress + ' checked)…'}`;

  return (
    <div className="finance-transaction-table">
      <TransactionFilters
        values={values}
        onChange={(field, value) =>
          saveFilters({ values: { ...values, [field]: value }, accounts: selected })
        }
        accounts={accountId ? [] : accounts}
        accountIds={selected}
        onAccountsChange={(accounts) => saveFilters({ values, accounts })}
        currencies={currencies}
        onClear={() => saveFilters({ values: {}, accounts: [] })}
      />
      <p role="status">
        {error
          ? error
          : offline
            ? cachedMessage
            : !scope
              ? scopeLoading
                ? 'Checking transaction accounts…'
                : scopeError
                  ? 'Reconnect and refresh Finance to search transactions.'
                  : 'No accounts selected.'
              : !page || page.rowsState === 'searching'
                ? 'Searching transactions…'
                : page.rowsState === 'confirmed-empty'
                  ? filtered
                    ? 'No matching transactions'
                    : 'No transactions'
                  : page.aggregateState === 'exact'
                    ? page.totalCount +
                      (page.totalCount === 1 ? ' transaction found' : ' transactions found')
                    : 'Transactions ready. Calculating the result count…'}
      </p>
      {cached?.lastCachedChange ? (
        <p>Last cached change {new Date(cached.lastCachedChange).toLocaleString()}</p>
      ) : null}
      {page?.aggregateState === 'exact' && page.totalsByCurrency?.length ? (
        <ul aria-label="Exact totals by currency">
          {page.totalsByCurrency.map(({ currency, currencyExponent, amountMinor }) => (
            <li key={currency}>
              {currency}{' '}
              {new Intl.NumberFormat(undefined, {
                style: 'currency',
                currency,
                minimumFractionDigits: currencyExponent,
                maximumFractionDigits: currencyExponent,
              }).format(amountMinor / 10 ** currencyExponent)}
            </li>
          ))}
        </ul>
      ) : null}
      {error || (!scope && scopeError && !offline) ? (
        <button
          type="button"
          onClick={() => (scopeError ? onRefreshScope?.() : setRefresh((value) => value + 1))}
        >
          Refresh transactions
        </button>
      ) : null}
      {visibleRows.length ? (
        <div
          className="finance-transaction-scroll"
          role="region"
          aria-label="Transaction results"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                {[
                  'Date',
                  'Description or payee',
                  'Merchant',
                  'Amount',
                  'Category and subcategory',
                  'Payment type',
                  'Check number',
                  'Receipt',
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const classifications = [
                  ...(row.classificationNames ?? []),
                  ...(row.allocations ?? []).map(({ financeCategoryId, subcategoryId }) =>
                    [categoryName(financeCategoryId), categoryName(subcategoryId)]
                      .filter(Boolean)
                      .join(' / '),
                  ),
                  ...(row.slices ?? []).map(({ financeCategoryId, categoryId, subcategoryId }) =>
                    [categoryName(financeCategoryId ?? categoryId), categoryName(subcategoryId)]
                      .filter(Boolean)
                      .join(' / '),
                  ),
                ];
                return (
                  <tr key={row.id}>
                    <td>
                      {row.effectiveAt ? new Date(row.effectiveAt).toLocaleDateString() : '—'}
                    </td>
                    <td>
                      <a
                        id={`finance-transaction-${row.id}`}
                        href={`/finance/transactions/${encodeURIComponent(row.id)}`}
                        aria-label={`Review ${row.description}`}
                        onClick={(event) => openRow(event, row, onOpen)}
                      >
                        {row.description}
                      </a>
                      {row.payee && row.payee !== row.description ? (
                        <span> · {row.payee}</span>
                      ) : null}
                      {row.reviewState === 'reconciliation-review' ? (
                        <a
                          href={`/finance/transactions/${encodeURIComponent(row.id)}`}
                          onClick={(event) => openRow(event, row, onOpen)}
                        >
                          Review reconciliation
                        </a>
                      ) : null}
                    </td>
                    <td>
                      {row.merchantId && row.merchantName ? (
                        <a
                          href={`/finance/merchants/${encodeURIComponent(row.merchantId)}`}
                          onClick={(event) => {
                            if (
                              !onOpenMerchant ||
                              event.altKey ||
                              event.metaKey ||
                              event.ctrlKey ||
                              event.shiftKey
                            )
                              return;
                            event.preventDefault();
                            if (row.merchantId) onOpenMerchant(row.merchantId);
                          }}
                        >
                          {row.merchantName}
                        </a>
                      ) : (
                        (row.merchantName ?? '—')
                      )}
                    </td>
                    <td>
                      {new Intl.NumberFormat(undefined, {
                        style: 'currency',
                        currency: row.currency,
                      }).format(row.amountMinor / 10 ** row.currencyExponent)}
                    </td>
                    <td>{[...new Set(classifications.filter(Boolean))].join(', ') || '—'}</td>
                    <td>{row.paymentType ?? '—'}</td>
                    <td>{row.checkNumber ?? '—'}</td>
                    <td>{row.receiptAvailable ? 'Available' : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {page?.nextCursor ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={pending || page.aggregateState === 'pending'}
        >
          {pending ? 'Loading…' : 'Load more'}
        </button>
      ) : null}
      {cached && cached.items.length > cachedLimit ? (
        <button type="button" onClick={() => setCachedLimit((limit) => limit + 50)}>
          Show more cached transactions
        </button>
      ) : null}
    </div>
  );
}
