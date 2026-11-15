import { useCallback, useEffect, useRef, useState } from 'react';
import { peekFinanceAccess } from '../security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../../sync/finance-api-snapshot.js';
import { UpcomingExpensesWidget } from './UpcomingExpensesWidget.js';
import type { UpcomingExpenseView } from '../upcoming/types.js';
import { AccountBalancesWidget, type FinanceDashboardAccount } from './AccountBalancesWidget.js';
import { useDashboardPreferences } from './DashboardFlagControl.js';

type WidgetState<T> =
  | { state: 'checking' | 'unavailable'; value?: undefined }
  | { state: 'ready'; ownerId: string; value: T };

function useDashboardItems<T>(ownerId: string, path: `/finance/${string}`) {
  const [widget, setWidget] = useState<WidgetState<T[]>>({ state: 'checking' });
  const retained = useRef<FinanceApiSnapshot<T[]> | undefined>(undefined);
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
    let next: FinanceApiSnapshot<T[]> | undefined;
    try {
      next = await loadFinanceApiSnapshot(async (read) => (await read<{ items: T[] }>(path)).items);
      const value = await readFinanceApiSnapshot(next, (items) => items);
      if (current !== request.current) {
        disposeFinanceApiSnapshot(next);
        return;
      }
      if (retained.current) disposeFinanceApiSnapshot(retained.current);
      retained.current = next;
      setWidget({ state: 'ready', ownerId, value });
    } catch {
      if (next) disposeFinanceApiSnapshot(next);
      if (current === request.current) clear();
    }
  }, [clear, ownerId, path]);

  useEffect(() => {
    clear();
    const unsubscribe = peekFinanceAccess()?.onLock(clear);
    void refresh();
    return () => {
      unsubscribe?.();
      clear();
    };
  }, [ownerId, clear, refresh]);

  return widget.state === 'ready' && widget.ownerId !== ownerId
    ? { state: 'checking' as const, value: undefined, refresh }
    : { ...widget, refresh };
}

export function FinanceDashboardPage({
  ownerId,
  csrfToken,
  onOpenAccount,
  onOpenUpcomingExpense,
}: {
  ownerId: string;
  csrfToken: string;
  onOpenAccount: (accountId: string) => void;
  onOpenUpcomingExpense: (expenseId: string) => void;
}) {
  const accounts = useDashboardItems<FinanceDashboardAccount>(ownerId, '/finance/accounts');
  const upcoming = useDashboardItems<UpcomingExpenseView>(ownerId, '/finance/upcoming-expenses');
  const preferences = useDashboardPreferences(csrfToken);
  const includedIds = new Set(
    preferences.flags
      ?.filter((flag) => flag.targetKind === 'account' && flag.included)
      .map(({ targetId }) => targetId),
  );
  const accountsReady = accounts.state === 'ready' && preferences.status === 'ready';
  return (
    <section className="finance-dashboard" aria-labelledby="finance-dashboard-title">
      <header>
        <h2 id="finance-dashboard-title">Finance dashboard</h2>
      </header>
      {accounts.state === 'unavailable' ? (
        <section aria-label="Dashboard accounts unavailable">
          <p>Account balances are unavailable.</p>
          <button type="button" onClick={() => void accounts.refresh()}>
            Refresh account balances
          </button>
        </section>
      ) : accountsReady ? (
        <AccountBalancesWidget
          accounts={accounts.value}
          includedIds={includedIds}
          onOpenAccount={onOpenAccount}
        />
      ) : preferences.status !== 'unavailable' ? (
        <p role="status">Checking account balances…</p>
      ) : null}
      <UpcomingExpensesWidget
        items={upcoming.value}
        state={upcoming.state}
        onRefresh={() => void upcoming.refresh()}
        preferences={preferences}
        onOpenExpense={onOpenUpcomingExpense}
      />
    </section>
  );
}
