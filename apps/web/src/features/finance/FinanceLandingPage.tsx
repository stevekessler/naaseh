import { FinanceAccountsPage } from './accounts/FinanceAccountsPage.js';
import {
  SimplefinConnectionPanel,
  type SimplefinConnectionView,
} from './accounts/SimplefinConnectionPanel.js';
import { financeRequest } from './finance-client.js';
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
  const [connection, setConnection] = useState<SimplefinConnectionView>();
  const [jobId, setJobId] = useState<string>();
  const [accountGeneration, setAccountGeneration] = useState(0);
  useEffect(() => {
    let active = true;
    void financeRequest<{ items: SimplefinConnectionView[] }>('/finance/connections')
      .then((page) => {
        if (active) setConnection((current) => current ?? page.items[0]);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
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
          setJobId(undefined);
          setAccountGeneration((value) => value + 1);
        }
      } catch {
        /* A transient network failure is retried without changing the saved job. */
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
    setJobId(job.id);
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
        <FinanceCategoryManager userId={ownerId} isAdmin={role === 'admin'} csrfToken={csrfToken} />
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
    </section>
  );
}
