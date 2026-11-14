import { useCallback, useEffect, useRef, useState } from 'react';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';

export interface FinanceDashboardAccount {
  id: string;
  friendlyName: string;
  currency: string;
  currencyExponent: number;
  currentBalanceMinor: number;
  freshness?: { lastUpdatedAt: string; stale: boolean };
}

export interface FinanceDashboardWidgetState<T> {
  state: 'checking' | 'ready' | 'unavailable';
  value?: T;
}

export function FinanceDashboardPage({
  ownerId,
  onOpenAccount,
}: {
  ownerId: string;
  onOpenAccount: (accountId: string) => void;
}) {
  const [widget, setWidget] = useState<FinanceDashboardWidgetState<FinanceDashboardAccount[]>>({
    state: 'checking',
  });
  const retained = useRef<FinanceApiSnapshot<FinanceDashboardAccount[]> | undefined>(undefined);
  const request = useRef(0);

  const clear = useCallback(() => {
    request.current++;
    if (retained.current) disposeFinanceApiSnapshot(retained.current);
    retained.current = undefined;
    setWidget({ state: 'unavailable' });
  }, []);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    setWidget({ state: 'checking' });
    let next: FinanceApiSnapshot<FinanceDashboardAccount[]> | undefined;
    try {
      next = await loadFinanceApiSnapshot(
        async (read) =>
          (await read<{ items: FinanceDashboardAccount[] }>('/finance/accounts')).items,
      );
      const accounts = await readFinanceApiSnapshot(next, (value) => value);
      if (current !== request.current) {
        disposeFinanceApiSnapshot(next);
        return;
      }
      if (retained.current) disposeFinanceApiSnapshot(retained.current);
      retained.current = next;
      setWidget({ state: 'ready', value: accounts });
    } catch {
      if (next) disposeFinanceApiSnapshot(next);
      if (current === request.current) clear();
    }
  }, [clear]);

  useEffect(() => {
    clear();
    const unsubscribe = peekFinanceAccess()?.onLock(clear);
    void refresh();
    return () => {
      unsubscribe?.();
      clear();
    };
  }, [ownerId, clear, refresh]);

  const accounts = widget.value ?? [];
  return (
    <section className="finance-dashboard" aria-labelledby="finance-dashboard-title">
      <header>
        <h2 id="finance-dashboard-title">Finance dashboard</h2>
        <p>Current protected account summaries and their recorded freshness.</p>
      </header>
      {widget.state === 'checking' ? <p role="status">Checking Finance dashboard…</p> : null}
      {widget.state === 'unavailable' ? (
        <section aria-label="Finance dashboard unavailable">
          <p>Reconnect and refresh Finance to view dashboard data.</p>
          <button type="button" onClick={() => void refresh()}>
            Refresh dashboard
          </button>
        </section>
      ) : null}
      {widget.state === 'ready' && accounts.length === 0 ? (
        <section aria-label="Empty Finance dashboard">
          <h3>No accounts yet</h3>
          <p>Create an account or connect a provider to begin. No balance data is available.</p>
        </section>
      ) : null}
      {widget.state === 'ready' && accounts.length ? (
        <section aria-label="Dashboard accounts" className="finance-dashboard-accounts">
          <h3>Accounts</h3>
          <div className="finance-account-grid">
            {accounts.map((account) => (
              <article key={account.id}>
                <h4>{account.friendlyName}</h4>
                <p>
                  {new Intl.NumberFormat(undefined, {
                    style: 'currency',
                    currency: account.currency,
                    minimumFractionDigits: account.currencyExponent,
                    maximumFractionDigits: account.currencyExponent,
                  }).format(account.currentBalanceMinor / 10 ** account.currencyExponent)}
                </p>
                <p>{account.freshness?.stale ? 'Refresh recommended' : 'Up to date'}</p>
                <button type="button" onClick={() => onOpenAccount(account.id)}>
                  Open account
                </button>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
