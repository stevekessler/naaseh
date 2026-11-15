import { FinanceReceiptsPage } from './receipts/FinanceReceiptsPage.js';
import { resumeReceiptUploads } from './receipts/receipt-client.js';
import { FinanceAccountsPage } from './accounts/FinanceAccountsPage.js';
import { FinanceAccountCreatePage } from './accounts/FinanceAccountCreatePage.js';
import {
  SimplefinConnectionPanel,
  type SimplefinConnectionView,
} from './accounts/SimplefinConnectionPanel.js';
import { financeRequest } from './finance-client.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FinanceTransactionsPage } from './transactions/FinanceTransactionsPage.js';
import { FinanceCategoriesPage } from './catalog/FinanceCategoriesPage.js';
import { FinanceMerchantPage } from './catalog/FinanceMerchantPage.js';
import { FinanceBudgetsPage } from './budgets/FinanceBudgetsPage.js';
import { FinanceDashboardPage } from './dashboard/FinanceDashboardPage.js';
import { peekFinanceAccess } from './security/finance-access.js';
import {
  disposeFinanceApiSnapshot,
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  type FinanceApiSnapshot,
} from '../../sync/finance-api-snapshot.js';
import {
  financeTransactionOrigin,
  type AppHistoryState,
  type AppRoute,
  type FinanceRoute,
} from '../../app/router.js';

export function FinanceLandingPage({
  ownerId,
  role,
  csrfToken,
  route = { section: 'finance', view: 'dashboard' },
  navigate = () => undefined,
}: {
  ownerId: string;
  role: 'admin' | 'user';
  csrfToken: string;
  route?: FinanceRoute;
  navigate?: (route: AppRoute, state?: AppHistoryState) => void;
}) {
  useEffect(() => {
    const request = new AbortController();
    const resume = () => void resumeReceiptUploads(csrfToken, request.signal).catch(() => {});
    const unsubscribe = peekFinanceAccess()?.onLock(() => request.abort());
    window.addEventListener('online', resume);
    resume();
    return () => {
      request.abort();
      unsubscribe?.();
      window.removeEventListener('online', resume);
    };
  }, [csrfToken, ownerId]);
  const [connection, setConnection] = useState<SimplefinConnectionView>();
  const [connectionState, setConnectionState] = useState<'checking' | 'ready' | 'unavailable'>(
    'checking',
  );
  const connectionSnapshot = useRef<FinanceApiSnapshot<SimplefinConnectionView[]> | undefined>(
    undefined,
  );
  const connectionRequest = useRef(0);
  const clearConnection = useCallback(() => {
    connectionRequest.current++;
    if (connectionSnapshot.current) disposeFinanceApiSnapshot(connectionSnapshot.current);
    connectionSnapshot.current = undefined;
    setConnection(undefined);
    setConnectionState('unavailable');
  }, []);
  const refreshConnections = useCallback(
    async (preferredId?: string) => {
      const requestId = ++connectionRequest.current;
      if (!connectionSnapshot.current) setConnectionState('checking');
      let retained: FinanceApiSnapshot<SimplefinConnectionView[]> | undefined;
      try {
        retained = await loadFinanceApiSnapshot(
          async (request) =>
            (await request<{ items: SimplefinConnectionView[] }>('/finance/connections')).items,
        );
        const items = await readFinanceApiSnapshot(retained, (value) => value);
        if (requestId !== connectionRequest.current) {
          disposeFinanceApiSnapshot(retained);
          return false;
        }
        const next =
          (preferredId ? items.find(({ id }) => id === preferredId) : undefined) ??
          items.find(({ scope }) => scope.type === 'owner' && scope.ownerId === ownerId);
        if (connectionSnapshot.current) disposeFinanceApiSnapshot(connectionSnapshot.current);
        connectionSnapshot.current = retained;
        setConnection(next);
        setConnectionState('ready');
        return Boolean(next);
      } catch {
        if (retained) disposeFinanceApiSnapshot(retained);
        if (requestId === connectionRequest.current) clearConnection();
        return false;
      }
    },
    [clearConnection, ownerId],
  );
  useEffect(() => {
    clearConnection();
    const unsubscribe = peekFinanceAccess()?.onLock(clearConnection);
    if (route.view === 'dashboard' || route.view === 'accounts' || route.view === 'account-new')
      void refreshConnections();
    return () => {
      unsubscribe?.();
      clearConnection();
    };
  }, [clearConnection, refreshConnections, route.view]);
  const claim = async (setupToken: string) => {
    const claimed = await financeRequest<{ id: string }>('/finance/connections/simplefin/claim', {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({ scope: { type: 'owner', ownerId }, setupToken }),
    });
    if (!(await refreshConnections(claimed.id)))
      throw new Error('The new SimpleFIN connection could not be confirmed.');
  };
  const refresh = async () => {
    const retained = connectionSnapshot.current;
    if (!connection || !retained) return;
    const current = await readFinanceApiSnapshot(retained, (items) =>
      items.find(({ id, version }) => id === connection.id && version === connection.version),
    );
    if (!current) {
      clearConnection();
      throw new Error('The SimpleFIN connection is no longer available.');
    }
    await financeRequest<unknown>(`/finance/connections/${connection.id}/refresh`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: '{}',
    });
    if (!(await refreshConnections(connection.id)))
      throw new Error('The SimpleFIN refresh could not be confirmed.');
  };
  const modalOrigin = route.transactionId
    ? financeTransactionOrigin(history.state as AppHistoryState | null)
    : undefined;
  const modalBackground = modalOrigin?.background;
  const originAccount =
    modalOrigin?.route.view === 'accounts' ? modalOrigin.route.accountId : undefined;
  const openTransaction = (transactionId: string, focusId?: string) => {
    navigate(
      { section: 'finance', view: 'transactions', transactionId },
      {
        financeBackground: {
          pathname: location.pathname,
          search: location.search,
          scrollY: window.scrollY,
          ...(focusId ? { focusId } : {}),
        },
      },
    );
  };
  const closeTransaction = () => {
    if (modalBackground) history.back();
    else navigate({ section: 'finance', view: 'transactions' });
  };
  const openBudget = (budgetId: string) =>
    navigate({ section: 'finance', view: 'budgets', budgetId });

  useEffect(() => {
    if (!modalBackground) return;
    return () => {
      if (location.pathname !== modalBackground.pathname) return;
      requestAnimationFrame(() => {
        window.scrollTo({ top: modalBackground.scrollY, left: 0 });
        if (modalBackground.focusId)
          document.getElementById(modalBackground.focusId)?.focus({ preventScroll: true });
      });
    };
  }, [modalBackground]);

  const accountWorkspace = (
    <>
      <FinanceAccountsPage
        ownerId={ownerId}
        csrfToken={csrfToken}
        {...(originAccount || route.accountId
          ? { initialAccountId: (originAccount || route.accountId)! }
          : {})}
        onOpenTransaction={openTransaction}
        onOpenAccount={(accountId) => navigate({ section: 'finance', view: 'accounts', accountId })}
      />
      {connectionState === 'ready' ? (
        <SimplefinConnectionPanel
          {...(connection ? { connection } : {})}
          onClaim={claim}
          onRefresh={refresh}
        />
      ) : (
        <p role="status">
          {connectionState === 'checking'
            ? 'Checking SimpleFIN connections…'
            : 'Reconnect and refresh Finance before managing SimpleFIN.'}
        </p>
      )}
    </>
  );
  const view = originAccount ? 'accounts' : route.view;
  return (
    <section className="finance-landing">
      <header>
        <h1>Finance</h1>
        <p>Accounts, transactions, and budgets in one protected workspace.</p>
      </header>
      <nav aria-label="Finance sections">
        <button
          aria-current={view === 'accounts' || view === 'account-new' ? 'page' : undefined}
          onClick={() => navigate({ section: 'finance', view: 'accounts' })}
        >
          Accounts
        </button>
        <button
          aria-current={view === 'transactions' ? 'page' : undefined}
          onClick={() => navigate({ section: 'finance', view: 'transactions' })}
        >
          Transactions
        </button>
        <button
          aria-current={view === 'categories' ? 'page' : undefined}
          onClick={() => navigate({ section: 'finance', view: 'categories' })}
        >
          Categories
        </button>
        <button
          aria-current={view === 'merchants' ? 'page' : undefined}
          onClick={() => navigate({ section: 'finance', view: 'merchants' })}
        >
          Merchants
        </button>
        <button
          aria-current={view === 'budgets' ? 'page' : undefined}
          onClick={() => navigate({ section: 'finance', view: 'budgets' })}
        >
          Budgets
        </button>
      </nav>
      {view === 'dashboard' ? (
        <FinanceDashboardPage
          ownerId={ownerId}
          onOpenAccount={(accountId) =>
            navigate({ section: 'finance', view: 'accounts', accountId })
          }
        />
      ) : view === 'accounts' ? (
        <>
          {accountWorkspace}
          {originAccount && route.transactionId ? (
            <FinanceTransactionsPage
              csrfToken={csrfToken}
              initialTransactionId={route.transactionId}
              modalOnly
              onCloseTransaction={closeTransaction}
              onOpenBudget={openBudget}
            />
          ) : null}
        </>
      ) : view === 'account-new' ? (
        <>
          <FinanceAccountCreatePage
            ownerId={ownerId}
            csrfToken={csrfToken}
            onCreated={(accountId) => navigate({ section: 'finance', view: 'accounts', accountId })}
          />
          {connectionState === 'ready' ? (
            <SimplefinConnectionPanel
              {...(connection ? { connection } : {})}
              onClaim={claim}
              onRefresh={refresh}
            />
          ) : null}
        </>
      ) : view === 'transactions' ? (
        <FinanceTransactionsPage
          csrfToken={csrfToken}
          {...(route.transactionId ? { initialTransactionId: route.transactionId } : {})}
          onOpenTransaction={openTransaction}
          onCloseTransaction={closeTransaction}
          onOpenBudget={openBudget}
          onOpenMerchant={(merchantId) =>
            navigate({ section: 'finance', view: 'merchants', merchantId })
          }
        />
      ) : view === 'receipts' ? (
        <FinanceReceiptsPage />
      ) : view === 'categories' ? (
        <FinanceCategoriesPage userId={ownerId} isAdmin={role === 'admin'} csrfToken={csrfToken} />
      ) : view === 'merchants' ? (
        <FinanceMerchantPage
          userId={ownerId}
          isAdmin={role === 'admin'}
          csrfToken={csrfToken}
          {...(route.merchantId ? { initialMerchantId: route.merchantId } : {})}
        />
      ) : view === 'budgets' ? (
        <FinanceBudgetsPage
          csrfToken={csrfToken}
          currentUserId={ownerId}
          {...(route.budgetId ? { initialBudgetId: route.budgetId } : {})}
          onOpenBudget={(budgetId) => navigate({ section: 'finance', view: 'budgets', budgetId })}
          onOpenGroups={() => navigate({ section: 'groups' })}
        />
      ) : (
        <section aria-labelledby={`finance-${view}-title`}>
          <h2 id={`finance-${view}-title`}>
            {view === 'upcoming-expense-new'
              ? 'New upcoming expense'
              : view
                  .split('-')
                  .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
                  .join(' ')}
          </h2>
          <p>This Finance destination is not available yet.</p>
        </section>
      )}
    </section>
  );
}
