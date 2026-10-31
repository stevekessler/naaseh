import { FinanceAccountsPage } from './accounts/FinanceAccountsPage.js';
import {
  SimplefinConnectionPanel,
  type SimplefinConnectionView,
} from './accounts/SimplefinConnectionPanel.js';
import { financeRequest } from './finance-client.js';
import { useState } from 'react';
import { FinanceTransactionsPage } from './transactions/FinanceTransactionsPage.js';
import { FinanceCategoryManager } from './catalog/FinanceCategoryManager.js';
import { FinanceMerchantPage } from './catalog/FinanceMerchantPage.js';
import { FinanceBudgetsPage } from './budgets/FinanceBudgetsPage.js';

export function FinanceLandingPage({
  ownerId,
  role,
  csrfToken,
}: {
  ownerId: string;
  role: 'admin' | 'user';
  csrfToken: string;
}) {
  const [connection, setConnection] = useState<SimplefinConnectionView>();
  const [view, setView] = useState<
    'accounts' | 'transactions' | 'categories' | 'merchants' | 'budgets'
  >(() => (location.pathname.startsWith('/finance/budgets') ? 'budgets' : 'accounts'));
  const [selectedMerchantId, setSelectedMerchantId] = useState<string>();
  const claim = async (setupToken: string) => {
    const claimed = await financeRequest<SimplefinConnectionView>(
      '/finance/connections/simplefin/claim',
      {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({ scope: { type: 'owner', ownerId }, setupToken }),
      },
    );
    setConnection(claimed);
  };
  const refresh = async () => {
    if (!connection) return;
    const job = await financeRequest<{
      status: NonNullable<SimplefinConnectionView['importStatus']>;
    }>(`/finance/connections/${connection.id}/refresh`, {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: '{}',
    });
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
          <FinanceAccountsPage ownerId={ownerId} csrfToken={csrfToken} />
          <SimplefinConnectionPanel
            {...(connection ? { connection } : {})}
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
