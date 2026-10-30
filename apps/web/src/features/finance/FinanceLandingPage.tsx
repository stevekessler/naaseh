import { FinanceAccountsPage } from './accounts/FinanceAccountsPage.js';
import {
  SimplefinConnectionPanel,
  type SimplefinConnectionView,
} from './accounts/SimplefinConnectionPanel.js';
import { FinanceClientError, financeRequest } from './finance-client.js';
import { useEffect, useState } from 'react';
import { FinanceTransactionsPage } from './transactions/FinanceTransactionsPage.js';
import { FinanceCategoryManager } from './catalog/FinanceCategoryManager.js';
import { FinanceMerchantPage } from './catalog/FinanceMerchantPage.js';
import { FinanceBudgetsPage } from './budgets/FinanceBudgetsPage.js';

export function FinanceLandingPage({
  ownerId,
  role,
  csrfToken,
  assignableGroups,
}: {
  ownerId: string;
  role: 'admin' | 'user';
  csrfToken: string;
  assignableGroups: Array<{ id: string; name: string }>;
}) {
  const [authorization, setAuthorization] = useState('initial');
  useEffect(() => {
    const refresh = (event: Event) => {
      const next = (event as CustomEvent<{ authorization?: string }>).detail?.authorization;
      if (next) setAuthorization(next);
      if (next === 'denied') {
        setRunningJob(undefined);
        setConnection(undefined);
      }
    };
    window.addEventListener('finance-sync', refresh);
    return () => window.removeEventListener('finance-sync', refresh);
  }, []);
  const [connection, setConnection] = useState<SimplefinConnectionView>();
  const [runningJob, setRunningJob] = useState<{ id: string; connectionId: string }>();
  const jobId = runningJob?.id;
  const [accountGeneration, setAccountGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    void financeRequest<{ items: SimplefinConnectionView[] }>('/finance/connections')
      .then((page) => {
        if (
          active &&
          runningJob &&
          page.items.some(
            (item) =>
              item.id === runningJob.connectionId && ['revoked', 'archived'].includes(item.status),
          )
        )
          setRunningJob(undefined);
        if (active)
          setConnection((current) => {
            const authorized = page.items.filter(
              (item) => !['revoked', 'archived'].includes(item.status),
            );
            const fresh = authorized.find((item) => item.id === current?.id);
            if (fresh)
              return {
                ...fresh,
                ...(current?.importStatus ? { importStatus: current.importStatus } : {}),
              };
            // Losing management rights does not imply losing read access to a running job.
            return current &&
              runningJob?.connectionId === current.id &&
              !page.items.some(
                (item) => item.id === current.id && ['revoked', 'archived'].includes(item.status),
              )
              ? current
              : authorized[0];
          });
      })
      .catch((error: unknown) => {
        if (
          active &&
          error instanceof FinanceClientError &&
          [401, 403].includes(error.problem.status)
        ) {
          setRunningJob(undefined);
          setConnection(undefined);
        }
      });
    return () => {
      active = false;
    };
  }, [authorization, runningJob?.connectionId]);
  useEffect(() => {
    if (!jobId) return;
    let active = true;
    const poll = async () => {
      try {
        const job = await financeRequest<{
          status: NonNullable<SimplefinConnectionView['importStatus']>;
        }>(`/finance/import-jobs/${jobId}`);
        if (!active) return;
        setConnection((current) => (current ? { ...current, importStatus: job.status } : current));
        if (!['queued', 'running'].includes(job.status)) {
          setRunningJob(undefined);
          setAccountGeneration((value) => value + 1);
        }
      } catch (error) {
        if (
          active &&
          error instanceof FinanceClientError &&
          [401, 403, 404].includes(error.problem.status)
        ) {
          setRunningJob(undefined);
          setConnection(undefined);
        }
        // Transient failures preserve the running job for the next poll.
      }
    };
    const timer = window.setInterval(() => void poll(), 3000);
    void poll();
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [jobId]);
  const [view, setView] = useState<
    'accounts' | 'transactions' | 'categories' | 'merchants' | 'budgets'
  >(() => (location.pathname.startsWith('/finance/budgets') ? 'budgets' : 'accounts'));
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>();
  const claim = async (
    setupToken: string,
    scope: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string },
  ) => {
    const claimed = await financeRequest<SimplefinConnectionView>(
      '/finance/connections/simplefin/claim',
      {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ scope, setupToken }),
      },
    );
    setConnection(claimed);
  };
  const refresh = async () => {
    if (!connection) return;
    const job = await financeRequest<{
      id: string;
      status: NonNullable<SimplefinConnectionView['importStatus']>;
    }>(`/finance/connections/${connection.id}/refresh`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: '{}',
    });
    setRunningJob({ id: job.id, connectionId: connection.id });
    setConnection((current) => (current ? { ...current, importStatus: job.status } : current));
  };
  return (
    <section className="finance-landing">
      <header>
        <h1>Finance</h1>
        <p>Accounts, transactions, and budgets in one protected workspace.</p>
      </header>
      <nav aria-label="Finance sections">
        <button
          aria-current={view === 'accounts' ? 'page' : undefined}
          onClick={() => setView('accounts')}
        >
          Accounts
        </button>
        <button
          aria-current={view === 'transactions' ? 'page' : undefined}
          onClick={() => setView('transactions')}
        >
          Transactions
        </button>
        <button
          aria-current={view === 'categories' ? 'page' : undefined}
          onClick={() => setView('categories')}
        >
          Categories
        </button>
        <button
          aria-current={view === 'merchants' ? 'page' : undefined}
          onClick={() => setView('merchants')}
        >
          Merchants
        </button>
        <button
          aria-current={view === 'budgets' ? 'page' : undefined}
          onClick={() => {
            setView('budgets');
            history.pushState({}, '', '/finance/budgets');
          }}
        >
          Budgets
        </button>
      </nav>
      <div key={authorization}>
        {view === 'accounts' ? (
          <>
            <FinanceAccountsPage
              key={accountGeneration}
              ownerId={ownerId}
              csrfToken={csrfToken}
              assignableGroups={assignableGroups}
            />
            <SimplefinConnectionPanel
              {...(connection ? { connection } : {})}
              ownerId={ownerId}
              assignableGroups={assignableGroups}
              onClaim={claim}
              onRefresh={refresh}
            />
          </>
        ) : view === 'transactions' ? (
          <FinanceTransactionsPage
            csrfToken={csrfToken}
            onOpenMerchant={(merchantId) => {
              setSelectedMerchantId(merchantId);
              setView('merchants');
            }}
          />
        ) : view === 'categories' ? (
          <FinanceCategoryManager
            userId={ownerId}
            isAdmin={role === 'admin'}
            csrfToken={csrfToken}
          />
        ) : view === 'merchants' ? (
          <FinanceMerchantPage
            userId={ownerId}
            isAdmin={role === 'admin'}
            csrfToken={csrfToken}
            {...(selectedMerchantId ? { initialMerchantId: selectedMerchantId } : {})}
          />
        ) : (
          <FinanceBudgetsPage csrfToken={csrfToken} currentUserId={ownerId} />
        )}
      </div>
    </section>
  );
}
