import { useEffect, useState } from 'react';
import { financeRequest } from '../finance-client.js';
import type { BudgetDetailView, ReconciliationRecordView } from './FinanceBudgetDetail.js';

export function BudgetReconciliation({
  budget,
  csrfToken,
  onReconciled,
}: {
  budget: BudgetDetailView;
  csrfToken: string;
  onReconciled: (record: ReconciliationRecordView) => void;
}) {
  const [online, setOnline] = useState(navigator.onLine);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);
  const history = budget.reconciliations ?? [];
  const reasons = [...(budget.reconciliationReadiness?.reasons ?? [])];
  if (!budget.totalsComplete && reasons.length === 0) {
    reasons.push('Complete access to every linked account is required.');
  }
  if (!online) reasons.push('Connect to the internet to reconcile this budget.');
  const submit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const record = await financeRequest<ReconciliationRecordView>(
        `/finance/budgets/${budget.id}/reconcile`,
        {
          method: 'POST',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({ expectedVersion: budget.version }),
        },
      );
      onReconciled(record);
      setConfirming(false);
    } catch {
      setConfirming(false);
      setError(
        'Reconciliation could not be completed. Nothing was changed; refresh and review the budget.',
      );
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <section
      className="finance-budget-reconciliation"
      aria-labelledby="budget-reconciliation-heading"
    >
      <header>
        <div>
          <h3 id="budget-reconciliation-heading">Reconciliation</h3>
          <p>
            {budget.status === 'changed-since-reconciliation'
              ? 'Changed since reconciliation'
              : history.length
                ? 'Reconciled'
                : 'Not reconciled'}
          </p>
        </div>
        <button disabled={reasons.length > 0 || submitting} onClick={() => setConfirming(true)}>
          Reconcile budget
        </button>
      </header>
      {reasons.length ? (
        <ul className="finance-reconciliation-reasons">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
      <ol className="finance-reconciliation-history" aria-label="Reconciliation history">
        {history.map((record) => (
          <li key={record.id}>
            <strong>Reconciled by {record.reconciledBy}</strong>
            <span>
              {new Date(record.reconciledAt).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </span>
          </li>
        ))}
      </ol>
      {confirming ? (
        <dialog open aria-label="Confirm budget reconciliation">
          <h3>Confirm budget reconciliation</h3>
          <p>This records immutable evidence for the complete authorized totals currently shown.</p>
          <p>Later changes will be labeled without rewriting this history.</p>
          <div>
            <button disabled={submitting} onClick={() => setConfirming(false)}>
              Cancel
            </button>
            <button disabled={submitting} onClick={() => void submit()}>
              {submitting ? 'Reconciling…' : 'Confirm reconciliation'}
            </button>
          </div>
        </dialog>
      ) : null}
    </section>
  );
}
