import { useMemo, useState } from 'react';
import { createUlid } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { ReconciliationReview, type ReconciliationIssueView } from './ReconciliationReview.js';

export type TransactionView = {
  id: string;
  accountId: string;
  description: string;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  version: number;
  allocations: Array<{ id: string; amountMinor: number; financeCategoryId: string }>;
  merchantId?: string;
  transferId?: string;
  reconciliationState: string;
  reviewState: string;
  effectiveAt?: string;
  payee?: string;
  memo?: string;
  entrySnapshot?: { description: string; amountMinor: number; payee?: string; memo?: string };
  providerSnapshot?: { description: string; amountMinor: number; payee?: string; memo?: string };
};
type CategoryView = { id: string; name: string };

const money = (minor: number, currency: string, exponent: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: exponent,
    maximumFractionDigits: exponent,
  }).format(minor / 10 ** exponent);

export function TransactionDetail({
  transaction,
  allTransactions,
  categories,
  scope,
  issue,
  csrfToken,
  onChange,
}: {
  transaction: TransactionView;
  allTransactions: TransactionView[];
  categories: CategoryView[];
  scope?: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
  issue?: ReconciliationIssueView;
  csrfToken: string;
  onChange: (transaction: TransactionView) => void;
}) {
  const [splits, setSplits] = useState(() =>
    transaction.allocations.length
      ? transaction.allocations.map((allocation) => ({
          id: allocation.id,
          amount: String(allocation.amountMinor / 10 ** transaction.currencyExponent),
          categoryId: allocation.financeCategoryId,
        }))
      : [],
  );
  const [message, setMessage] = useState('');
  const [transferOpen, setTransferOpen] = useState(false);
  const [otherSide, setOtherSide] = useState('');
  const [showReconciliation, setShowReconciliation] = useState(
    transaction.reviewState === 'reconciliation-review',
  );
  const [preview, setPreview] = useState<{
    outcome: string;
    dependentCounts: Record<string, number>;
    preservedRecordTypes: string[];
  }>();
  const allocated = useMemo(
    () =>
      splits.reduce(
        (sum, split) =>
          sum + Math.round(Number(split.amount || 0) * 10 ** transaction.currencyExponent),
        0,
      ),
    [splits, transaction.currencyExponent],
  );
  const remaining = transaction.amountMinor - allocated;
  const addSplit = () =>
    setSplits((current) => [
      ...current,
      { id: createUlid(), amount: '', categoryId: categories[0]?.id ?? '' },
    ]);
  const save = async () => {
    if (
      remaining !== 0 ||
      splits.some(({ categoryId, amount }) => !categoryId || !Number.isFinite(Number(amount)))
    )
      return;
    const updated = await financeRequest<TransactionView>(
      `/finance/transactions/${transaction.id}/allocations`,
      {
        method: 'PUT',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedVersion: transaction.version,
          allocations: splits.map((split) => ({
            id: split.id,
            amountMinor: Math.round(Number(split.amount) * 10 ** transaction.currencyExponent),
            financeCategoryId: split.categoryId,
          })),
        }),
      },
    );
    onChange(updated);
    setMessage('Allocations saved.');
  };
  const confirmTransfer = async () => {
    if (!scope) {
      setMessage('Account access changed. Refresh and try again.');
      return;
    }
    await financeRequest('/finance/transfers', {
      method: 'POST',
      csrfToken,
      idempotencyKey: crypto.randomUUID(),
      body: JSON.stringify({
        id: createUlid(),
        scope,
        transactionIds: [transaction.id, otherSide],
      }),
    });
    setMessage('Transfer confirmed.');
    setTransferOpen(false);
  };
  const loadPreview = async () =>
    setPreview(
      await financeRequest(`/finance/records/transaction/${transaction.id}/deletion-preview`),
    );
  return (
    <section
      className="finance-transaction-detail"
      aria-label={`${transaction.description} details`}
    >
      <h2>{transaction.description}</h2>
      <p>
        Original total:{' '}
        {money(transaction.amountMinor, transaction.currency, transaction.currencyExponent)}
      </p>
      <dl>
        <dt>Entry source</dt>
        <dd>{transaction.entrySnapshot?.description ?? 'None'}</dd>
        <dt>Provider source</dt>
        <dd>{transaction.providerSnapshot?.description ?? 'Not attached'}</dd>
        <dt>Reconciliation</dt>
        <dd>{transaction.reconciliationState}</dd>
      </dl>
      <section aria-label="Split allocations">
        <h3>Split transaction</h3>
        {splits.map((split, index) => (
          <div key={split.id}>
            <label>
              Split {index + 1} amount
              <input
                inputMode="decimal"
                value={split.amount}
                onChange={(event) =>
                  setSplits((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, amount: event.target.value } : item,
                    ),
                  )
                }
              />
            </label>
            <label>
              Split {index + 1} category
              <select
                value={split.categoryId}
                onChange={(event) =>
                  setSplits((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, categoryId: event.target.value } : item,
                    ),
                  )
                }
              >
                <option value="">Choose category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ))}
        <p>Remaining: {money(remaining, transaction.currency, transaction.currencyExponent)}</p>
        <button onClick={addSplit}>Add split</button>
        <button onClick={() => void save()} disabled={remaining !== 0 || splits.length === 0}>
          Save splits
        </button>
      </section>
      <button onClick={() => setTransferOpen(true)}>Mark as transfer</button>
      {transferOpen ? (
        <section aria-label="Transfer confirmation">
          <label>
            Other transfer side
            <select value={otherSide} onChange={(event) => setOtherSide(event.target.value)}>
              <option value="">Choose transaction</option>
              {allTransactions
                .filter(({ id }) => id !== transaction.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.description}
                  </option>
                ))}
            </select>
          </label>
          <button onClick={() => void confirmTransfer()} disabled={!otherSide}>
            Confirm transfer
          </button>
        </section>
      ) : null}
      {issue ? (
        <button onClick={() => setShowReconciliation(true)}>Review reconciliation</button>
      ) : null}
      {showReconciliation && issue ? (
        <ReconciliationReview
          transaction={transaction}
          issue={issue}
          csrfToken={csrfToken}
          onResolved={(updated) => onChange(updated as TransactionView)}
        />
      ) : null}
      <button onClick={() => void loadPreview()}>Preview transaction removal</button>
      {preview ? (
        <section aria-label="Transaction removal impact">
          <strong>{preview.outcome}</strong>
          <p>Preserved: {preview.preservedRecordTypes.join(', ') || 'audit record'}</p>
        </section>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
