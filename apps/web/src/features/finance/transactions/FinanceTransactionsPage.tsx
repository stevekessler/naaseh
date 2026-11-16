import { peekFinanceAccess } from '../security/finance-access.js';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  continueTransactionQuery,
  startTransactionQuery,
  transactionFilters,
  waitForTransactionQuery,
} from './transaction-query.js';
import { TransactionTable } from './TransactionTable.js';
import { TransactionModal } from './TransactionModal.js';
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
type CandidateCursor = { queryId: string; cursor?: string };
type SnapshotData = {
  accounts: AccountView[];
  transactions: TransactionView[];
  categories: CategoryView[];
  merchants: MerchantView[];
  issues: ReconciliationIssueView[];
  candidateCursor?: CandidateCursor;
};

async function loadTransactionGraph(
  request: FinanceSnapshotRequest,
  transactionId?: string,
  signal?: AbortSignal,
): Promise<SnapshotData> {
  const [accountPage, categoryPage, merchantPage, reviewPage] = await Promise.all([
    request<{ items: AccountView[] }>('/finance/accounts', { browse: true }),
    request<{ items: CategoryView[] }>('/finance/categories', { browse: true }),
    request<{ items: MerchantView[] }>('/finance/merchants', { browse: true }),
    transactionId
      ? request<{ items: ReconciliationIssueView[] }>('/finance/review-issues', { browse: true })
      : Promise.resolve({ items: [] }),
  ]);
  const issues = transactionId
    ? reviewPage.items.filter(({ candidateIds }) => candidateIds.includes(transactionId))
    : [];
  const transactions = [];
  let candidateCursor: CandidateCursor | undefined;
  if (transactionId) {
    const selected = await request<TransactionView>(
      `/finance/transactions/${encodeURIComponent(transactionId)}?browse=1`,
    );
    transactions.push(selected);
    if (signal && accountPage.items.length) {
      const started = performance.now();
      const filters = transactionFilters(
        {
          currency: selected.currency,
          ...(selected.amountMinor > 0
            ? { amountMax: '-1' }
            : { amount: String(-selected.amountMinor) }),
        },
        accountPage.items.map(({ id }) => id),
      );
      try {
        let candidates = await startTransactionQuery(filters, undefined, signal);
        while (
          candidates.rowsState === 'searching' &&
          candidates.queryId &&
          performance.now() - started < 1500
        ) {
          await waitForTransactionQuery(signal);
          candidates = await continueTransactionQuery(candidates.queryId, signal);
        }
        transactions.push(
          ...(await Promise.all(
            candidates.items
              .filter(({ id }) => id !== transactionId)
              .slice(0, 50)
              .map(({ id }) =>
                request<TransactionView>(`/finance/transactions/${encodeURIComponent(id)}`),
              ),
          )),
        );
        if (candidates.queryId && (candidates.nextCursor || candidates.rowsState === 'searching'))
          candidateCursor = {
            queryId: candidates.queryId,
            ...(candidates.nextCursor ? { cursor: candidates.nextCursor } : {}),
          };
      } catch {
        signal.throwIfAborted();
        // The selected transaction remains reviewable when candidate lookup is unavailable.
      }
    }
  }
  return {
    accounts: accountPage.items,
    transactions,
    categories: categoryPage.items,
    merchants: merchantPage.items,
    issues,
    ...(candidateCursor ? { candidateCursor } : {}),
  };
}

export function FinanceTransactionsPage({
  csrfToken,
  currentUserId,
  modalOnly = false,
  onOpenBudget,
  onOpenMerchant,
  initialTransactionId,
  onOpenTransaction,
  onCloseTransaction,
}: {
  csrfToken: string;
  currentUserId?: string;
  modalOnly?: boolean;
  onOpenBudget?: (budgetId: string) => void;
  onOpenMerchant?: (id: string) => void;
  initialTransactionId?: string;
  onOpenTransaction?: (transactionId: string, focusId?: string) => void;
  onCloseTransaction?: () => void;
}) {
  const [accounts, setAccounts] = useState<AccountView[]>([]);
  const [transactions, setTransactions] = useState<TransactionView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [merchants, setMerchants] = useState<MerchantView[]>([]);
  const [issues, setIssues] = useState<ReconciliationIssueView[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [removalImpact, setRemovalImpact] = useState<TransactionRemovalImpact>();
  const previewRequest = useRef(0);
  const selectionRequest = useRef(0);
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<FinanceApiSnapshot<SnapshotData>>();
  const retainedSnapshot = useRef<FinanceApiSnapshot<SnapshotData> | undefined>(undefined);
  const [reload, setReload] = useState(0);
  const [tableRevision, setTableRevision] = useState(0);
  const [scopeError, setScopeError] = useState(false);
  const [candidateCursor, setCandidateCursor] = useState<CandidateCursor>();
  const [candidateMessage, setCandidateMessage] = useState('');
  const candidateLoad = useRef<AbortController | undefined>(undefined);
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
    candidateLoad.current?.abort();
    candidateLoad.current = undefined;
    setCandidateCursor(undefined);
    setCandidateMessage('');
    setReconciliationMessage('');
    selectionRequest.current++;
    clearRemovalImpact();
    setTransactions((value) => (value.length ? [] : value));
    setCategories((value) => (value.length ? [] : value));
    setMerchants((value) => (value.length ? [] : value));
    setIssues((value) => (value.length ? [] : value));
    setLoading(false);
  }, [clearRemovalImpact]);
  const revokeSnapshot = useCallback(() => {
    setAccounts([]);
    setScopeError(true);
    clearSnapshot();
  }, [clearSnapshot]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    clearSnapshot();
    setLoading(true);
    const unsubscribe = peekFinanceAccess()?.onLock(() => {
      controller.abort();
      active = false;
      revokeSnapshot();
    });
    let retained: FinanceApiSnapshot<SnapshotData> | undefined;
    void (async () => {
      retained = await loadFinanceApiSnapshot((request) =>
        loadTransactionGraph(request, initialTransactionId, controller.signal),
      );
      if (!active) {
        disposeFinanceApiSnapshot(retained);
        return;
      }
      const data = await readFinanceApiSnapshot(retained, (value) => value);
      if (!active) return;
      setAccounts(data.accounts);
      setScopeError(false);
      setTransactions(data.transactions);
      setCategories(data.categories);
      setMerchants(data.merchants);
      setIssues(data.issues);
      setCandidateCursor(data.candidateCursor);
      setSelectedId(
        initialTransactionId && data.transactions.some(({ id }) => id === initialTransactionId)
          ? initialTransactionId
          : undefined,
      );
      retainedSnapshot.current = retained;
      setSnapshot(retained);
      setLoading(false);
    })().catch(() => {
      if (retained) disposeFinanceApiSnapshot(retained);
      if (active) revokeSnapshot();
    });
    return () => {
      active = false;
      controller.abort();
      candidateLoad.current?.abort();
      unsubscribe?.();
      if (retained) disposeFinanceApiSnapshot(retained);
      if (retainedSnapshot.current) disposeFinanceApiSnapshot(retainedSnapshot.current);
      retainedSnapshot.current = undefined;
    };
  }, [clearSnapshot, initialTransactionId, reload, revokeSnapshot]);
  const loadMoreCandidates = async () => {
    const previous = retainedSnapshot.current;
    if (!previous || !candidateCursor || candidateLoad.current) return;
    const controller = new AbortController();
    candidateLoad.current = controller;
    const { signal } = controller;
    const { queryId, cursor } = candidateCursor;
    let additional: FinanceApiSnapshot<TransactionView[]> | undefined;
    let next: FinanceApiSnapshot<SnapshotData> | undefined;
    const current = () => !signal.aborted && retainedSnapshot.current === previous;
    setCandidateMessage('Loading more transactions…');
    try {
      const started = performance.now();
      let result = await continueTransactionQuery(queryId, signal, cursor);
      while (result.rowsState === 'searching' && performance.now() - started < 10_000) {
        await waitForTransactionQuery(signal);
        result = await continueTransactionQuery(queryId, signal, cursor);
      }
      if (!current()) return;
      if (result.rowsState === 'searching') throw new Error('Candidate page unavailable.');
      if (result.items.length) {
        additional = await loadFinanceApiSnapshot((request) =>
          Promise.all(
            result.items.map(({ id }) =>
              request<TransactionView>(`/finance/transactions/${encodeURIComponent(id)}`),
            ),
          ),
        );
        if (!current()) return;
        next = await combineFinanceApiSnapshots(previous, additional, (data, rows) => {
          const known = new Set(data.transactions.map(({ id }) => id));
          return {
            ...data,
            transactions: [...data.transactions, ...rows.filter(({ id }) => !known.has(id))],
          };
        });
        const data = await readFinanceApiSnapshot(next, (value) => value);
        if (!current()) return;
        retainedSnapshot.current = next;
        setSnapshot(next);
        setTransactions(data.transactions);
        disposeFinanceApiSnapshot(previous);
      }
      setCandidateCursor(result.nextCursor ? { queryId, cursor: result.nextCursor } : undefined);
      setCandidateMessage('');
    } catch {
      if (current())
        setCandidateMessage(
          'More candidate transactions are unavailable. Reopen this transaction to retry.',
        );
    } finally {
      if (candidateLoad.current === controller) candidateLoad.current = undefined;
      if (additional) disposeFinanceApiSnapshot(additional);
      if (next && next !== retainedSnapshot.current) disposeFinanceApiSnapshot(next);
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
      if (current()) revokeSnapshot();
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
      if (current() && !allowed) revokeSnapshot();
      return current() && allowed;
    } catch {
      if (current()) revokeSnapshot();
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
        next = await loadFinanceApiSnapshot((request) =>
          loadTransactionGraph(request, transactionId),
        );
      } else {
        changed = await loadFinanceApiSnapshot((request) =>
          Promise.all(
            [...new Set([transactionId, ...relatedIds])].map(async (id) => {
              const value = await request<TransactionView>(
                `/finance/transactions/${encodeURIComponent(id)}${id === transactionId ? '?browse=1' : ''}`,
              );
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
      disposeFinanceApiSnapshot(previous);
      setTableRevision((value) => value + 1);
      return true;
    } catch {
      if (next) disposeFinanceApiSnapshot(next);
      if (previous === retainedSnapshot.current) revokeSnapshot();
      return false;
    } finally {
      if (changed) disposeFinanceApiSnapshot(changed);
    }
  };

  const selected = transactions.find(({ id }) => id === selectedId);
  const selectedIssue =
    selected &&
    issues.find(
      ({ candidateIds, status }) =>
        (!status || status === 'open') && candidateIds.includes(selected.id),
    );
  return (
    <section className="finance-transactions">
      {!modalOnly ? (
        <>
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
                if (!queued) setReload((value) => value + 1);
              }}
            />
          ) : null}
          <TransactionTable
            accounts={accounts}
            categories={categories}
            reload={reload + tableRevision}
            scopeLoading={loading}
            scopeError={scopeError}
            onRefreshScope={() => setReload((value) => value + 1)}
            {...(onOpenTransaction ? { onOpen: onOpenTransaction } : {})}
            {...(onOpenMerchant ? { onOpenMerchant } : {})}
          />
        </>
      ) : null}
      {reconciliationMessage ? <p role="status">{reconciliationMessage}</p> : null}
      {initialTransactionId && onCloseTransaction ? (
        <TransactionModal onClose={onCloseTransaction}>
          {selected ? (
            <TransactionDetail
              {...(onOpenBudget ? { onOpenBudget } : {})}
              key={selected.id}
              transaction={selected}
              allTransactions={transactions}
              candidateMessage={candidateMessage}
              {...(candidateCursor ? { onMoreCandidates: loadMoreCandidates } : {})}
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
              {...(currentUserId ? { currentUserId } : {})}
              {...(removalImpact ? { removalImpact } : {})}
              onPreviewRemoval={() => previewRemoval(selected.id)}
              onChange={async (relatedIds = []) => {
                return snapshot ? refreshAfterMutation(snapshot, selected.id, relatedIds) : false;
              }}
            />
          ) : (
            <p role="status">{loading ? 'Loading transaction…' : 'Transaction unavailable.'}</p>
          )}
        </TransactionModal>
      ) : null}
    </section>
  );
}
