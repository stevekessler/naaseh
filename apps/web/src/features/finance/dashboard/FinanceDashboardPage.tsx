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
import { BudgetStatusWidget } from './BudgetStatusWidget.js';
import { RecentActivityWidget } from './RecentActivityWidget.js';
import { SpendTrendsWidget } from './SpendTrendsWidget.js';
import { readCachedDashboardItems } from './dashboard-cache.js';
import type { FinanceDashboardTargetKind } from '@naaseh/domain';

type WidgetState<T> =
  | { state: 'checking' | 'unavailable'; value?: undefined; cached?: undefined }
  | { state: 'ready'; ownerId: string; value: T; cached?: boolean };

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
      if (navigator.onLine === false) {
        const value = (await readCachedDashboardItems(path)) as T[];
        if (current === request.current)
          setWidget({ state: 'ready', ownerId, value, cached: true });
        return;
      }
      next = await loadFinanceApiSnapshot(
        async (read) => (await read<{ items: T[] }>(path, { browse: true })).items,
      );
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
    const reload = () => void refresh();
    window.addEventListener('online', reload);
    window.addEventListener('offline', reload);
    void refresh();
    return () => {
      window.removeEventListener('online', reload);
      window.removeEventListener('offline', reload);
      unsubscribe?.();
      clear();
    };
  }, [ownerId, clear, refresh]);

  return widget.state === 'ready' && widget.ownerId !== ownerId
    ? { state: 'checking' as const, value: undefined, cached: undefined, refresh }
    : { ...widget, refresh };
}

export function FinanceDashboardPage({
  ownerId,
  csrfToken,
  onOpenAccount,
  onOpenUpcomingExpense,
  onOpenBudget,
  onOpenTransaction,
}: {
  ownerId: string;
  csrfToken: string;
  onOpenAccount: (accountId: string) => void;
  onOpenUpcomingExpense: (expenseId: string) => void;
  onOpenBudget: (budgetId: string) => void;
  onOpenTransaction: (id: string, focusId?: string) => void;
}) {
  const accounts = useDashboardItems<FinanceDashboardAccount>(ownerId, '/finance/accounts');
  const upcoming = useDashboardItems<UpcomingExpenseView>(ownerId, '/finance/upcoming-expenses');
  const preferences = useDashboardPreferences(csrfToken);
  const flags = (kind: FinanceDashboardTargetKind) =>
    preferences.flags
      ?.filter((flag) => flag.targetKind === kind && flag.included)
      .map(({ targetId }) => targetId) ?? [];
  const includedIds = new Set(flags('account'));
  const accountIds = accounts.value?.map(({ id }) => id) ?? [];
  const accountsReady = accounts.state === 'ready' && preferences.status === 'ready';
  return (
    <section className="finance-dashboard" aria-labelledby="finance-dashboard-title">
      <header>
        <h2 id="finance-dashboard-title">Finance dashboard</h2>
      </header>
      {accounts.cached && <p>Account balances are saved values from this device.</p>}
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
      {upcoming.cached && <p>Upcoming expenses use partial offline data.</p>}
      <UpcomingExpensesWidget
        items={upcoming.value}
        state={upcoming.state}
        onRefresh={() => void upcoming.refresh()}
        preferences={preferences}
        onOpenExpense={onOpenUpcomingExpense}
      />
      {preferences.status === 'ready' ? (
        <>
          <BudgetStatusWidget
            ids={flags('budget')}
            csrfToken={csrfToken}
            onOpenBudget={onOpenBudget}
          />
          <RecentActivityWidget
            kind="merchant"
            ids={flags('merchant')}
            accountIds={accountIds}
            accountsStatus={accounts.state}
            csrfToken={csrfToken}
            onOpenTransaction={onOpenTransaction}
          />
          <RecentActivityWidget
            kind="category"
            ids={flags('category')}
            accountIds={accountIds}
            accountsStatus={accounts.state}
            csrfToken={csrfToken}
            onOpenTransaction={onOpenTransaction}
          />
        </>
      ) : preferences.status === 'unavailable' ? (
        <p>Personal dashboard selections are unavailable.</p>
      ) : (
        <p role="status">Checking personal dashboard selections…</p>
      )}
      <SpendTrendsWidget
        accounts={accounts.value ?? []}
        accountsStatus={accounts.state}
        csrfToken={csrfToken}
      />
    </section>
  );
}
