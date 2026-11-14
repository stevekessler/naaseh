import { peekFinanceAccess } from '../security/finance-access.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadFinanceApiSnapshot,
  readFinanceApiSnapshot,
  disposeFinanceApiSnapshot,
  combineFinanceApiSnapshots,
  type FinanceApiSnapshot,
  type FinanceSnapshotRequest,
} from '../../../sync/finance-api-snapshot.js';
import {
  TransactionDetail,
  type TransactionRemovalImpact,
  type TransactionView,
} from './TransactionDetail.js';
import {
  reconciliationCandidate,
  type ReconciliationIssueView,
  type ReconciliationDecision,
} from './ReconciliationReview.js';
import { TransactionSearch } from './TransactionSearch.js';
import { ManualTransactionForm } from './ManualTransactionForm.js';

type AccountView = {
  id: string;
  friendlyName: string;
  currency: string;
  currencyExponent?: number;
  version?: number;
  connectionId?: string;
  status?: string;
  scope?: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
};
type CategoryView = { id: string; name: string };
type MerchantView = { id: string; name: string };
type SnapshotData = {
  accounts: AccountView[];
  transactions: TransactionView[];
  categories: CategoryView[];
  merchants: MerchantView[];
  issues: ReconciliationIssueView[];
};

async function loadTransactionGraph(request: FinanceSnapshotRequest): Promise<SnapshotData> {
  const accountPage = await request<{ items: AccountView[] }>('/finance/accounts');
  const [pages, categoryPage, merchantPage, reviewPage] = await Promise.all([
    Promise.all(
      accountPage.items.map(({ id }) =>
        request<{ items: TransactionView[] }>(`/finance/accounts/${id}/transactions`),
      ),
    ),
    request<{ items: CategoryView[] }>('/finance/categories'),
    request<{ items: MerchantView[] }>('/finance/merchants'),
    request<{ items: ReconciliationIssueView[] }>('/finance/review-issues'),
  ]);
  return {
    accounts: accountPage.items,
    transactions: pages.flatMap(({ items }) => items),
    categories: categoryPage.items,
    merchants: merchantPage.items,
    issues: reviewPage.items,
  };
}

export function FinanceTransactionsPage({
  csrfToken,
  onOpenMerchant,
  initialTransactionId,
  onOpenTransaction,
  onCloseTransaction,
}: {
  csrfToken: string;
  onOpenMerchant?: (merchantId: string) => void;
  initialTransactionId?: string;
  onOpenTransaction?: (transactionId: string, focusId?: string) => void;
  onCloseTransaction?: () => void;
}) {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [merchants, setMerchants] = useState<MerchantView[]>([]);
  const [issues, setIssues] = useState<ReconciliationIssueView[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [removalImpact, setRemovalImpact] = useState<TransactionRemovalImpact>();
  const previewRequest = useRef(0);
  const selectionRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<FinanceApiSnapshot<SnapshotData>>();
  const [searchState, setSearchState] = useState<'checking' | 'ready' | 'failed'>('checking');
  const retainedSnapshot = useRef<FinanceApiSnapshot<SnapshotData> | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const [reconciliationMessage, setReconciliationMessage] = useState('');
  const [addingTransaction, setAddingTransaction] = useState(false);
  const clearRemovalImpact = useCallback(() => {
    previewRequest.current++;
    setRemovalImpact(undefined);
  }, []);
  const clearSnapshot = useCallback(() => {
    if (retainedSnapshot.current) disposeFinanceApiSnapshot(retainedSnapshot.current);
    retainedSnapshot.current = undefined;
    setSnapshot(undefined);
    setSelectedId(undefined);
    setReconciliationMessage('');
    selectionRequest.current++;
    clearRemovalImpact();
    setAccounts((value) => (value.length ? [] : value));
    setTransactions((value) => (value.length ? [] : value));
    setCategories((value) => (value.length ? [] : value));
    setMerchants((value) => (value.length ? [] : value));
    setIssues((value) => (value.length ? [] : value));
    setMatchedIds((value) => (value.length ? [] : value));
    setSearchState('failed');
    setLoading(false);
  }, [clearRemovalImpact]);
  useEffect(() => {
    let active = true;
    clearSnapshot();
    setLoading(true);
    const unsubscribe = peekFinanceAccess()?.onLock(clearSnapshot);
    let retained: FinanceApiSnapshot<SnapshotData> | undefined;
    void (async () => {
      retained = await loadFinanceApiSnapshot(loadTransactionGraph);
      if (!active) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      const data = await readFinanceApiSnapshot(retained, (value) => value);
      if (!active) return;
      setAccounts(data.accounts);
      setTransactions(data.transactions);
      setCategories(data.categories);
      setMerchants(data.merchants);
      setIssues(data.issues);
      setSelectedId(
        initialTransactionId && data.transactions.some(({ id }) => id === initialTransactionId)
          ? initialTransactionId
          : undefined,
      );
      retainedSnapshot.current = retained;
      setSnapshot(retained);
      setSearchState('checking');
      setLoading(false);
    })().catch(() => {
      if (retained) disposeFinanceApiSnapshot(retained);
      if (active) clearSnapshot();
    });
    return () => {
      active = false;
      unsubscribe?.();
      if (retained) disposeFinanceApiSnapshot(retained);
      if (retainedSnapshot.current) disposeFinanceApiSnapshot(retainedSnapshot.current);
      retainedSnapshot.current = undefined;
    };
  }, [clearSnapshot, initialTransactionId, reload]);
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
  const receiveMatches = useCallback(
    (ids: string[]) => {
      if (snapshot && snapshot === retainedSnapshot.current) setMatchedIds(ids);
    },
    [snapshot],
  );
  const authorizeSearch = useCallback(
    async (search: () => string[]) => {
      if (!snapshot) throw new Error('Refresh Finance before searching.');
      return readFinanceApiSnapshot(snapshot, () => search());
    },
    [snapshot],
  );
  const receiveSearchState = useCallback(
    (state: 'checking' | 'ready' | 'failed') => {
      if (!snapshot || snapshot !== retainedSnapshot.current) return;
      if (state === 'failed') clearSnapshot();
      else setSearchState(state);
    },
    [clearSnapshot, snapshot],
  );
  const openTransaction = async (id: string) => {
    const visit = ++selectionRequest.current;
    clearRemovalImpact();
    try {
      if (!snapshot) throw new Error('Refresh Finance before reviewing.');
      const verified = await readFinanceApiSnapshot(snapshot, () => id);
      if (snapshot === retainedSnapshot.current && visit === selectionRequest.current) {
        clearRemovalImpact();
        setSelectedId(verified);
        onOpenTransaction?.(verified, `finance-transaction-${verified}`);
      }
    } catch {
      if (snapshot === retainedSnapshot.current && visit === selectionRequest.current) {
        clearSnapshot();
      }
    }
  };
  const previewRemoval = async (id: string) => {
    if (!snapshot || snapshot !== retainedSnapshot.current) return;
    const visit = ++previewRequest.current;
    setRemovalImpact(undefined);
    const current = () => visit === previewRequest.current && snapshot === retainedSnapshot.current;
    let preview: FinanceApiSnapshot<TransactionRemovalImpact> | undefined;
    try {
      await readFinanceApiSnapshot(snapshot, () => undefined);
      if (!current()) return;
      preview = await loadFinanceApiSnapshot((request) =>
        request<TransactionRemovalImpact>(
          `/finance/records/transaction/${encodeURIComponent(id)}/deletion-preview`,
        ),
      );
      if (!current()) return;
      const impact = await readFinanceApiSnapshot(preview, ({ outcome, preservedRecordTypes }) => ({
        outcome,
        preservedRecordTypes,
      }));
      if (current()) setRemovalImpact(impact);
    } catch {
      if (current()) clearSnapshot();
    } finally {
      if (preview) disposeFinanceApiSnapshot(preview);
    }
  };
  const verifyTransactionAction = async (verify: (data: SnapshotData) => boolean) => {
    if (!snapshot || snapshot !== retainedSnapshot.current) return false;
    const selection = selectionRequest.current;
    const current = () =>
      snapshot === retainedSnapshot.current && selection === selectionRequest.current;
    try {
      const allowed = await readFinanceApiSnapshot(snapshot, verify);
      if (current() && !allowed) clearSnapshot();
      return current() && allowed;
    } catch {
      if (current()) clearSnapshot();
      return false;
    }
  };

  const authorizeReconciliation = async (
    id: string,
    version: number,
    issue: ReconciliationIssueView,
    candidateId: string,
    candidateVersion: number,
  ) => {
    return verifyTransactionAction(({ transactions, issues }) => {
      const verifiedIssue = issues.find(
        (item) => item.id === issue.id && item.version === issue.version,
      );
      if (
        !verifiedIssue ||
        (verifiedIssue.status && verifiedIssue.status !== 'open') ||
        !verifiedIssue.candidateIds.includes(id)
      )
        return false;
      const candidate = reconciliationCandidate(verifiedIssue, id);
      return (
        transactions.some((item) => item.id === id && item.version === version) &&
        candidate?.id === candidateId &&
        candidate.version === candidateVersion
      );
    });
  };

  const refreshAfterMutation = async (
    previous: FinanceApiSnapshot<SnapshotData>,
    transactionId: string,
    relatedIds: readonly string[],
    reconciliation?: ReconciliationDecision,
  ) => {
    if (previous !== retainedSnapshot.current) return false;
    const selection = ++selectionRequest.current;
    clearRemovalImpact();
    let next: FinanceApiSnapshot<SnapshotData> | undefined;
    let changed: FinanceApiSnapshot<TransactionView[]> | undefined;
    try {
      if (reconciliation) {
        next = await loadFinanceApiSnapshot(loadTransactionGraph);
      } else {
        changed = await loadFinanceApiSnapshot((request) =>
          Promise.all(
            [...new Set([transactionId, ...relatedIds])].map(async (id) => {
              const value = await request<TransactionView>(`/finance/transactions/${id}`);
              if (value.id !== id) throw new Error('Refresh Finance to verify this transaction.');
              return value;
            }),
          ),
        );
        if (previous !== retainedSnapshot.current) return false;
        next = await combineFinanceApiSnapshots(previous, changed, (prior, values) => {
          const updates = new Map(values.map((value) => [value.id, value]));
          return {
            ...prior,
            transactions: prior.transactions.map((value) => updates.get(value.id) ?? value),
          };
        });
      }
      if (previous !== retainedSnapshot.current) {
        disposeFinanceApiSnapshot(next);
        return false;
      }
      const data = await readFinanceApiSnapshot(next, (value) => value);
      if (previous !== retainedSnapshot.current) {
        disposeFinanceApiSnapshot(next);
        return false;
      }
      clearRemovalImpact();
      retainedSnapshot.current = next;
      setSnapshot(next);
      setAccounts(data.accounts);
      setTransactions(data.transactions);
      setCategories(data.categories);
      setMerchants(data.merchants);
      setIssues(data.issues);
      if (reconciliation)
        setReconciliationMessage(
          reconciliation === 'reconcile'
            ? 'Transactions reconciled.'
            : 'Transactions kept separate.',
        );
      if (selection === selectionRequest.current)
        setSelectedId(
          data.transactions.some((transaction) => transaction.id === transactionId)
            ? transactionId
            : undefined,
        );
      setMatchedIds([]);
      setSearchState('checking');
      disposeFinanceApiSnapshot(previous);
      return true;
    } catch {
      if (next) disposeFinanceApiSnapshot(next);
      if (previous === retainedSnapshot.current) clearSnapshot();
      return false;
    } finally {
      if (changed) disposeFinanceApiSnapshot(changed);
    }
  };

  const filtered = useMemo(() => {
    const ids = new Set(matchedIds);
    return transactions.filter(({ id }) => ids.has(id));
  }, [matchedIds, transactions]);
  const selected = transactions.find(({ id }) => id === selectedId);
  const selectedIssue =
    selected &&
    issues.find(
      ({ candidateIds, status }) =>
        (!status || status === 'open') && candidateIds.includes(selected.id),
    );
  const merchantName = (id: string | undefined) =>
    merchants.find((merchant) => merchant.id === id)?.name;
  return (
    <section className="finance-transactions">
      <h2>Transactions</h2>
      <button type="button" onClick={() => setAddingTransaction((value) => !value)}>
        Add Transaction
      </button>
      {addingTransaction ? (
        <ManualTransactionForm
          accounts={accounts}
          merchants={merchants}
          categories={categories}
          csrfToken={csrfToken}
          authorizeEdit={async () => Boolean(snapshot && retainedSnapshot.current === snapshot)}
          onSaved={async (_transaction, queued) => {
            if (!queued) {
              setReload((value) => value + 1);
            }
          }}
        />
      ) : null}
      {reconciliationMessage ? <p role="status">{reconciliationMessage}</p> : null}
      <TransactionSearch
        accounts={accounts}
        documents={searchDocuments}
        onMatches={receiveMatches}
        authorizeSearch={authorizeSearch}
        onState={receiveSearchState}
      />
      <p role="status">
        {loading
          ? 'Indexing transactions…'
          : !snapshot || searchState === 'failed'
            ? 'Reconnect and refresh Finance to search transactions.'
            : searchState === 'checking'
              ? 'Checking transactions…'
              : `${filtered.length} ${filtered.length === 1 ? 'transaction' : 'transactions'} found`}
      </p>
      {!loading && (!snapshot || searchState === 'failed') ? (
        <button onClick={() => setReload((value) => value + 1)}>Refresh transactions</button>
      ) : null}
      <div
        className="finance-transaction-window"
        role="feed"
        aria-busy={loading || Boolean(snapshot && searchState === 'checking')}
      >
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
            <button
              id={`finance-transaction-${transaction.id}`}
              onClick={() => {
                void openTransaction(transaction.id);
              }}
            >
              Review {transaction.description}
            </button>
            {transaction.reviewState === 'reconciliation-review' ? (
              <button
                onClick={() => {
                  void openTransaction(transaction.id);
                }}
              >
                Review reconciliation
              </button>
            ) : null}
          </article>
        ))}
      </div>
      {selected ? (
        <div className="modal-backdrop">
          <section role="dialog" aria-modal="true" aria-label="Transaction details">
            <button type="button" onClick={onCloseTransaction}>
              Close transaction
            </button>
            <TransactionDetail
              key={selected.id}
              transaction={selected}
              allTransactions={transactions}
              categories={categories}
              {...(accounts.find(({ id }) => id === selected.accountId)?.scope
                ? { scope: accounts.find(({ id }) => id === selected.accountId)!.scope! }
                : {})}
              {...(selectedIssue ? { issue: selectedIssue } : {})}
              authorizeReconciliation={authorizeReconciliation}
              authorizeTransactionEdit={(expected) =>
                verifyTransactionAction(({ transactions }) =>
                  expected.every(({ id, version }) =>
                    transactions.some((item) => item.id === id && item.version === version),
                  ),
                )
              }
              onReconciled={async (decision) => {
                if (snapshot) await refreshAfterMutation(snapshot, selected.id, [], decision);
              }}
              csrfToken={csrfToken}
              {...(removalImpact ? { removalImpact } : {})}
              onPreviewRemoval={() => previewRemoval(selected.id)}
              onChange={async (relatedIds = []) => {
                return snapshot ? refreshAfterMutation(snapshot, selected.id, relatedIds) : false;
              }}
            />
          </section>
        </div>
      ) : null}
    </section>
  );
}
