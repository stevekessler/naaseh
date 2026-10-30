import { useState } from 'react';
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

export type ReconciliationIssueView = {
  id: string;
  version: number;
  candidateIds: string[];
  provisional?: TransactionView;
  candidate?: TransactionView;
  candidates?: TransactionView[];
};

export function ReconciliationReview({
  transaction,
  issue,
  csrfToken,
  onResolved,
}: {
  transaction: TransactionView;
  issue: ReconciliationIssueView;
  csrfToken: string;
  onResolved: (transaction: TransactionView) => void;
}) {
  const [message, setMessage] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const candidates =
    issue.candidates ?? ([issue.provisional, issue.candidate].filter(Boolean) as TransactionView[]);
  const candidate = candidates.find(({ id }) => id !== transaction.id) ?? issue.candidate;
  const decide = async (decision: 'reconcile' | 'keep-separate') => {
    if (!candidate) return;
    setMessage('');
    setRefreshRequired(false);
    try {
      const updated = await financeRequest<TransactionView>(
        `/finance/transactions/${transaction.id}/provider-reconciliation`,
        {
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
        },
      );
      onResolved(updated);
      setMessage(
        decision === 'reconcile' ? 'Transactions reconciled.' : 'Transactions kept separate.',
      );
    } catch (error) {
      const safe =
        error instanceof FinanceClientError
          ? error.problem.message
          : 'Reconciliation could not be completed.';
      setMessage(safe);
      setRefreshRequired(true);
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
        <button onClick={() => void decide('reconcile')} disabled={!candidate}>
          Reconcile transactions
        </button>
        <button onClick={() => void decide('keep-separate')} disabled={!candidate}>
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
