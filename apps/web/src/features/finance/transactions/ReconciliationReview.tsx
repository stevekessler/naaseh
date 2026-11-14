import { useEffect, useRef, useState } from 'react';
import { FinanceClientError, financeRequest } from '../finance-client.js';

type TransactionView = {
  id: string;
  description: string;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  version: number;
  entrySnapshot?: { description: string };
  providerSnapshot?: { description: string };
};

export type ReconciliationDecision = 'reconcile' | 'keep-separate';

export type ReconciliationIssueView = {
  id: string;
  version: number;
  candidateIds: string[];
  status?: 'open' | 'resolved' | 'dismissed';
  provisional?: TransactionView;
  candidate?: TransactionView;
  candidates?: TransactionView[];
};

export function reconciliationCandidate(issue: ReconciliationIssueView, transactionId: string) {
  const candidates = issue.candidates ?? [issue.provisional, issue.candidate];
  return candidates.find(
    (candidate) =>
      candidate && candidate.id !== transactionId && issue.candidateIds.includes(candidate.id),
  );
}

export function ReconciliationReview({
  transaction,
  issue,
  csrfToken,
  authorizeDecision,
  onResolved,
}: {
  transaction: TransactionView;
  issue: ReconciliationIssueView;
  csrfToken: string;
  authorizeDecision: (
    transactionId: string,
    transactionVersion: number,
    issue: ReconciliationIssueView,
    candidateId: string,
    candidateVersion: number,
  ) => Promise<boolean>;
  onResolved: (decision: ReconciliationDecision) => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [pending, setPending] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const candidate = reconciliationCandidate(issue, transaction.id);
  const decide = async (decision: ReconciliationDecision) => {
    if (!candidate || pending || refreshRequired) return;
    setPending(true);
    setMessage('');
    setRefreshRequired(false);
    try {
      if (
        !(await authorizeDecision(
          transaction.id,
          transaction.version,
          issue,
          candidate.id,
          candidate.version,
        ))
      )
        return;
      await financeRequest(`/finance/transactions/${transaction.id}/provider-reconciliation`, {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          decision,
          reviewIssueId: issue.id,
          candidateTransactionId: candidate.id,
          expectedProvisionalVersion: transaction.version,
          expectedCandidateVersion: candidate.version,
          expectedReviewVersion: issue.version,
        }),
      });
      if (active.current) await onResolved(decision);
    } catch (error) {
      const safe =
        error instanceof FinanceClientError
          ? error.problem.message
          : 'Reconciliation could not be completed.';
      setMessage(safe);
      setRefreshRequired(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <section aria-label="Entry and provider comparison">
      <h3>Reconciliation review</h3>
      <div className="finance-comparison">
        <article>
          <h4>Entry</h4>
          <p>{transaction.entrySnapshot?.description ?? transaction.description}</p>
        </article>
        <article>
          <h4>Provider</h4>
          <p>
            {candidate?.providerSnapshot?.description ??
              candidate?.description ??
              'Provider candidate unavailable'}
          </p>
        </article>
      </div>
      <div className="finance-actions">
        <button
          onClick={() => void decide('reconcile')}
          disabled={!candidate || pending || refreshRequired}
        >
          Reconcile transactions
        </button>
        <button
          onClick={() => void decide('keep-separate')}
          disabled={!candidate || pending || refreshRequired}
        >
          Keep separate
        </button>
        {refreshRequired ? (
          <button onClick={() => location.reload()}>Refresh reconciliation</button>
        ) : null}
      </div>
      {message ? <p role={refreshRequired ? 'alert' : 'status'}>{message}</p> : null}
    </section>
  );
}
