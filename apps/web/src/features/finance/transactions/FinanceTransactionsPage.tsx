import { useCallback, useEffect, useMemo, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import { TransactionDetail, type TransactionView } from './TransactionDetail.js';
import type { ReconciliationIssueView } from './ReconciliationReview.js';
import { TransactionSearch } from './TransactionSearch.js';

type AccountView = {
  id: string;
  friendlyName: string;
  scope?: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
};
type CategoryView = { id: string; name: string };
type MerchantView = { id: string; name: string };

export function FinanceTransactionsPage({
  csrfToken,
  onOpenMerchant,
}: {
  csrfToken: string;
  onOpenMerchant?: (merchantId: string) => void;
}) {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [merchants, setMerchants] = useState<MerchantView[]>([]);
  const [issues, setIssues] = useState<ReconciliationIssueView[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    void (async () => {
      setLoading(true);
      const accountPage = await financeRequest<{ items: AccountView[] }>('/finance/accounts');
      setAccounts(accountPage.items);
      const [pages, categoryPage, merchantPage, reviewPage] = await Promise.all([
        Promise.all(
          accountPage.items.map(({ id }) =>
            financeRequest<{ items: TransactionView[] }>(`/finance/accounts/${id}/transactions`),
          ),
        ),
        financeRequest<{ items: CategoryView[] }>('/finance/categories'),
        financeRequest<{ items: MerchantView[] }>('/finance/merchants'),
        financeRequest<{ items: ReconciliationIssueView[] }>('/finance/review-issues'),
      ]);
      setTransactions(pages.flatMap(({ items }) => items));
      setCategories(categoryPage.items);
      setMerchants(merchantPage.items);
      setIssues(reviewPage.items);
      setLoading(false);
    })().catch(() => setLoading(false));
  }, []);
  const searchDocuments = useMemo(
    () =>
      transactions.map((transaction) => ({
        id: transaction.id,
        accountId: transaction.accountId,
        description: transaction.description,
        ...(transaction.payee ? { payee: transaction.payee } : {}),
        ...(transaction.memo ? { memo: transaction.memo } : {}),
        ...(transaction.merchantId && merchants.find(({ id }) => id === transaction.merchantId)
          ? { merchantName: merchants.find(({ id }) => id === transaction.merchantId)!.name }
          : {}),
      })),
    [merchants, transactions],
  );
  const receiveMatches = useCallback((ids: string[]) => setMatchedIds(ids), []);
  const filtered = useMemo(() => {
    const ids = new Set(matchedIds);
    return transactions.filter(({ id }) => ids.has(id));
  }, [matchedIds, transactions]);
  const selected = transactions.find(({ id }) => id === selectedId);
  const merchantName = (id: string | undefined) =>
    merchants.find((merchant) => merchant.id === id)?.name;
  return (
    <section className="finance-transactions">
      <h2>Transactions</h2>
      <TransactionSearch
        accounts={accounts}
        documents={searchDocuments}
        onMatches={receiveMatches}
      />
      <p role="status">
        {loading
          ? 'Indexing transactions…'
          : `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'} found`}
      </p>
      <div className="finance-transaction-window" role="feed" aria-busy={loading}>
        {filtered.slice(0, 200).map((transaction) => (
          <article key={transaction.id} aria-label={`${transaction.description} transaction`}>
            <h3>{transaction.description}</h3>
            <p>
              {new Date(
                (transaction as TransactionView & { effectiveAt?: string }).effectiveAt ??
                  Date.now(),
              ).toLocaleDateString()}
            </p>
            {transaction.merchantId && merchantName(transaction.merchantId) ? (
              <a
                href={`/finance/merchants/${transaction.merchantId}`}
                onClick={(event) => {
                  if (onOpenMerchant) {
                    event.preventDefault();
                    onOpenMerchant(transaction.merchantId!);
                  }
                }}
              >
                {merchantName(transaction.merchantId)}
              </a>
            ) : null}
            <button onClick={() => setSelectedId(transaction.id)}>
              Review {transaction.description}
            </button>
            {transaction.reviewState === 'reconciliation-review' ? (
              <button onClick={() => setSelectedId(transaction.id)}>Review reconciliation</button>
            ) : null}
          </article>
        ))}
      </div>
      {selected ? (
        <TransactionDetail
          transaction={selected}
          allTransactions={transactions}
          categories={categories}
          {...(accounts.find(({ id }) => id === selected.accountId)?.scope
            ? { scope: accounts.find(({ id }) => id === selected.accountId)!.scope! }
            : {})}
          {...(issues.find(({ candidateIds }) => candidateIds.includes(selected.id))
            ? { issue: issues.find(({ candidateIds }) => candidateIds.includes(selected.id))! }
            : {})}
          csrfToken={csrfToken}
          onChange={(updated) =>
            setTransactions((current) =>
              current.map((item) => (item.id === updated.id ? updated : item)),
            )
          }
        />
      ) : null}
    </section>
  );
}
