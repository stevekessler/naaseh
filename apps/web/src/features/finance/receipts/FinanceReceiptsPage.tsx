import { useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';
import { ReceiptContent } from './ReceiptContent.js';
import { requestReceiptPage, type ReceiptView } from './receipt-client.js';

type Label = { id: string; name: string; parentId?: string };
type Catalog = { budgets: Label[]; categories: Label[]; merchants: Label[] };
const catalog = { budgets: [], categories: [], merchants: [] };
type Filters = {
  date: string;
  dateFrom: string;
  dateTo: string;
  budgetIds: string;
  categoryIds: string;
  subcategoryIds: string;
  merchantIds: string;
};
const empty: Filters = {
  date: '',
  dateFrom: '',
  dateTo: '',
  budgetIds: '',
  categoryIds: '',
  subcategoryIds: '',
  merchantIds: '',
};
const endpoint = '/finance/receipts';

export function FinanceReceiptsPage() {
  const [filters, setFilters] = useState(empty);
  const [labels, setLabels] = useState<Catalog>(catalog);
  const [results, setResults] = useState<ReceiptView[]>([]);
  const [next, setNext] = useState<string>();
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const [controller, setController] = useState<AbortController>();
  const search = new URLSearchParams({
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  for (const [key, value] of Object.entries(filters)) if (value) search.set(key, value);
  const fingerprint = search.toString();

  useEffect(() => {
    const request = new AbortController();
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      request.abort();
      setLabels(catalog);
    });
    void Promise.all(
      (['budgets', 'categories', 'merchants'] as const).map(async (key) => {
        const page = await financeRequest<{ items: Label[] }>('/finance/' + key, {
          signal: request.signal,
          headers: { 'x-finance-browse': '1' },
        });
        return [key, page.items] as const;
      }),
    )
      .then((values) => {
        if (!request.signal.aborted) setLabels(Object.fromEntries(values) as Catalog);
      })
      .catch(() => {});
    return () => {
      request.abort();
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    const request = new AbortController();
    setController(request);
    setResults([]);
    setCursor(undefined);
    setNext(undefined);
    setMessage('');
    setLoaded(false);
    setLoading(true);
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      request.abort();
      setResults([]);
      setNext(undefined);
      setMessage('');
      setLoading(false);
    });
    const timer = setTimeout(() => {
      void requestReceiptPage(endpoint + '?' + fingerprint, { signal: request.signal })
        .then((page) => {
          if (request.signal.aborted) return;
          setResults(page.items);
          setNext(page.nextCursor);
          setLoaded(true);
        })
        .catch(() => {
          if (!request.signal.aborted)
            setMessage('Receipts could not be loaded. Check the filters or refresh.');
        })
        .finally(() => {
          if (!request.signal.aborted) setLoading(false);
        });
    }, 150);
    return () => {
      clearTimeout(timer);
      request.abort();
      unsubscribe?.();
    };
  }, [fingerprint, refresh]);

  const loadNext = async () => {
    if (!next || loading || !controller || controller.signal.aborted || cursor === next) return;
    const token = next;
    setLoading(true);
    setMessage('');
    try {
      const page = await requestReceiptPage(
        endpoint + '?' + fingerprint + '&' + new URLSearchParams({ cursor: token }),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setResults((current) => [
        ...new Map([...current, ...page.items].map((row) => [row.id, row])).values(),
      ]);
      setNext(page.nextCursor);
      setCursor(token);
    } catch {
      if (!controller.signal.aborted)
        setMessage('More receipts could not be loaded. Refresh and try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const change = (field: keyof Filters, value: string) =>
    setFilters((current) => ({
      ...current,
      ...(field === 'date' && value ? { dateFrom: '', dateTo: '' } : {}),
      ...((field === 'dateFrom' || field === 'dateTo') && value ? { date: '' } : {}),
      [field]: value,
    }));
  const filterSelect = (label: string, field: keyof Filters, options: Label[]) => (
    <label>
      {label}
      <select value={filters[field]} onChange={(event) => change(field, event.target.value)}>
        <option value="">All</option>
        {options.map(({ id, name }) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-labelledby="finance-receipts-title">
      <h2 id="finance-receipts-title">Receipts</h2>
      <fieldset className="finance-transaction-filters">
        <legend>Filter receipts</legend>
        <label>
          Transaction date{' '}
          <input
            type="date"
            value={filters.date}
            onChange={(event) => change('date', event.target.value)}
          />
        </label>
        <label>
          From transaction date{' '}
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(event) => change('dateFrom', event.target.value)}
          />
        </label>
        <label>
          Through transaction date{' '}
          <input
            type="date"
            value={filters.dateTo}
            onChange={(event) => change('dateTo', event.target.value)}
          />
        </label>
        {filterSelect('Budget', 'budgetIds', labels.budgets)}
        {filterSelect(
          'Category',
          'categoryIds',
          labels.categories.filter(({ parentId }) => !parentId),
        )}
        {filterSelect(
          'Subcategory',
          'subcategoryIds',
          labels.categories.filter(({ parentId }) => Boolean(parentId)),
        )}
        {filterSelect('Merchant', 'merchantIds', labels.merchants)}
        <button type="button" onClick={() => setFilters(empty)}>
          Clear receipt filters
        </button>
      </fieldset>
      {message ? <p role="alert">{message}</p> : null}
      {loading ? <p role="status">Loading receipts…</p> : null}
      {!loading && loaded && !results.length && !next ? (
        <p role="status">No matching receipts.</p>
      ) : null}
      <button type="button" onClick={() => setRefresh((value) => value + 1)}>
        Refresh receipts
      </button>
      <ul className="finance-receipt-results">
        {results.map((receipt) => (
          <li key={receipt.id}>
            <h3>{receipt.originalFilename}</h3>
            <dl>
              <dt>Transaction date</dt>
              <dd>{receipt.transactionDate ?? 'Unavailable'}</dd>
              {receipt.merchant ? (
                <>
                  <dt>Merchant</dt>
                  <dd>{receipt.merchant}</dd>
                </>
              ) : null}
              {receipt.classifications?.some(
                ({ category, subcategory }) => category || subcategory,
              ) ? (
                <>
                  <dt>Category</dt>
                  <dd>
                    {[
                      ...new Set(
                        receipt.classifications
                          .map(({ category, subcategory }) =>
                            [category, subcategory].filter(Boolean).join(' / '),
                          )
                          .filter(Boolean),
                      ),
                    ].join(', ')}
                  </dd>
                </>
              ) : null}
              {receipt.budgets?.length ? (
                <>
                  <dt>Budgets</dt>
                  <dd>{receipt.budgets.map(({ name }) => name).join(', ')}</dd>
                </>
              ) : null}
              <dt>Uploaded</dt>
              <dd>{new Date(receipt.createdAt).toLocaleString()}</dd>
            </dl>
            <a href={'/finance/transactions/' + encodeURIComponent(receipt.parentId)}>
              {receipt.transactionDescription ?? 'Open transaction'}
            </a>
            <ReceiptContent receipt={receipt} />
          </li>
        ))}
      </ul>
      {next ? (
        <button type="button" onClick={() => void loadNext()} disabled={loading}>
          Load more receipts
        </button>
      ) : null}
    </section>
  );
}
