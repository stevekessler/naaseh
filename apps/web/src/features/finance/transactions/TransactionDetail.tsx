import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createUlid } from '@naaseh/domain';
import { financeRequest } from '../finance-client.js';
import { ReconciliationReview, type ReconciliationIssueView } from './ReconciliationReview.js';
import { RefundRelationshipEditor } from './RefundRelationshipEditor.js';
import { CreateFinancialTask } from '../budgets/CreateFinancialTask.js';
import { RelatedFinanceTasks } from '../RelatedFinanceTasks.js';

export type TransactionView = {
  id: string;
  accountId: string;
  description: string;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  version: number;
  allocations: Array<{
    id: string;
    amountMinor: number;
    financeCategoryId: string;
    subcategoryId?: string;
  }>;
  paymentType?: string;
  checkNumber?: string;
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
type CategoryView = { id: string; name: string; parentId?: string; status?: 'active' | 'archived' };
export type TransactionRemovalImpact = {
  outcome: string;
  preservedRecordTypes: string[];
};

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
  removalImpact,
  onPreviewRemoval,
  authorizeReconciliation,
  authorizeTransactionEdit,
  onReconciled,
  onChange,
  currentUserId,
}: {
  transaction: TransactionView;
  allTransactions: TransactionView[];
  categories: CategoryView[];
  scope?: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
  issue?: ReconciliationIssueView;
  csrfToken: string;
  removalImpact?: TransactionRemovalImpact;
  onPreviewRemoval: () => Promise<void>;
  authorizeTransactionEdit: (
    expected: ReadonlyArray<Pick<TransactionView, 'id' | 'version'>>,
  ) => Promise<boolean>;
  authorizeReconciliation: ComponentProps<typeof ReconciliationReview>['authorizeDecision'];
  onReconciled: ComponentProps<typeof ReconciliationReview>['onResolved'];
  onChange: (relatedIds?: readonly string[]) => Promise<boolean>;
  currentUserId?: string;
}) {
  const [splits, setSplits] = useState(() =>
    transaction.allocations.length
      ? transaction.allocations.map((allocation) => ({
          id: allocation.id,
          amount: String(allocation.amountMinor / 10 ** transaction.currencyExponent),
          categoryId: allocation.financeCategoryId,
          subcategoryId: allocation.subcategoryId ?? '',
        }))
      : [],
  );
  const [message, setMessage] = useState('');
  const knownPaymentTypes = ['cash', 'check', 'card', 'ach', 'digital-other'];
  const [paymentType, setPaymentType] = useState(
    knownPaymentTypes.includes(transaction.paymentType ?? '') ? (transaction.paymentType ?? '') : '',
  );
  const [checkNumber, setCheckNumber] = useState(transaction.checkNumber ?? '');
  const [saving, setSaving] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [transferOpen, setTransferOpen] = useState(false);
  const [otherSide, setOtherSide] = useState('');
  const [showReconciliation, setShowReconciliation] = useState(
    transaction.reviewState === 'reconciliation-review',
  );
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
      {
        id: createUlid(),
        amount: '',
        categoryId: categories.find(({ parentId, status }) => !parentId && status !== 'archived')?.id ?? '',
        subcategoryId: '',
      },
    ]);
  const save = async () => {
    if (
      saving ||
      remaining !== 0 ||
      splits.some(({ categoryId, amount }) => !categoryId || !Number.isFinite(Number(amount)))
    )
      return;
    setSaving(true);
    try {
      if (!(await authorizeTransactionEdit([transaction]))) return;
      await financeRequest(
        `/finance/transactions/${encodeURIComponent(transaction.id)}/allocations`,
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
              ...(split.subcategoryId ? { subcategoryId: split.subcategoryId } : {}),
            })),
          }),
        },
      );
      if (active.current && (await onChange())) setMessage('Allocations saved.');
    } catch {
      setMessage('Allocations could not be saved. Refresh the transaction and try again.');
    } finally {
      setSaving(false);
    }
  };
  const savePaymentMetadata = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (!(await authorizeTransactionEdit([transaction]))) return;
      await financeRequest(`/finance/transactions/${encodeURIComponent(transaction.id)}`, {
        method: 'PATCH',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          expectedVersion: transaction.version,
          paymentType: paymentType || null,
          checkNumber: checkNumber.trim() || null,
        }),
      });
      if (active.current && (await onChange())) setMessage('Payment details saved.');
    } catch {
      setMessage('Payment details could not be saved. Refresh the transaction and try again.');
    } finally {
      setSaving(false);
    }
  };
  const confirmTransfer = async () => {
    if (saving) return;
    const other = allTransactions.find(({ id }) => id === otherSide);
    if (!scope || !other) {
      setMessage('Account access changed. Refresh and try again.');
      return;
    }
    setSaving(true);
    try {
      if (!(await authorizeTransactionEdit([transaction, other]))) return;
      await financeRequest('/finance/transfers', {
        method: 'POST',
        csrfToken,
        idempotencyKey: crypto.randomUUID(),
        body: JSON.stringify({
          id: createUlid(),
          scope,
          transactionIds: [transaction.id, other.id],
          expectedVersions: [transaction.version, other.version],
        }),
      });
      if (active.current && (await onChange([other.id]))) {
        setMessage('Transfer confirmed.');
        setTransferOpen(false);
      }
    } catch {
      setMessage('Transfer could not be confirmed. Refresh the transactions and try again.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section
      className="finance-transaction-detail"
      aria-label={`${transaction.description} details`}
    >
      <h2>{transaction.description}</h2>
      {currentUserId ? (
        <CreateFinancialTask
          target={{ type: 'transaction', id: transaction.id }}
          description="Review transaction"
          currentUserId={currentUserId}
          csrfToken={csrfToken}
          verifyAccess={() => authorizeTransactionEdit([transaction])}
        />
      ) : null}
      <RelatedFinanceTasks targetType="transaction" targetId={transaction.id} />
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
      <section aria-label="Payment details">
        <h3>Payment details</h3>
        <label>
          Payment type
          <select value={paymentType} onChange={(event) => setPaymentType(event.target.value)}>
            <option value="">Unspecified</option>
            <option value="cash">Cash</option>
            <option value="check">Check</option>
            <option value="card">Card</option>
            <option value="ach">ACH</option>
            <option value="digital-other">Digital (Other)</option>
          </select>
        </label>
        <label>
          Check number
          <input
            value={checkNumber}
            maxLength={64}
            onChange={(event) => setCheckNumber(event.target.value)}
          />
        </label>
        <button type="button" disabled={saving} onClick={() => void savePaymentMetadata()}>
          Save payment details
        </button>
      </section>
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
                      itemIndex === index
                        ? { ...item, categoryId: event.target.value, subcategoryId: '' }
                        : item,
                    ),
                  )
                }
              >
                <option value="">Choose category</option>
                {categories
                  .filter(({ parentId, status }) => !parentId && status !== 'archived')
                  .map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                  ))}
              </select>
            </label>
            <label>
              Split {index + 1} subcategory
              <select
                value={split.subcategoryId}
                onChange={(event) =>
                  setSplits((current) =>
                    current.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, subcategoryId: event.target.value } : item,
                    ),
                  )
                }
              >
                <option value="">No subcategory</option>
                {categories
                  .filter(
                    ({ parentId, status }) =>
                      parentId === split.categoryId && status !== 'archived',
                  )
                  .map((category) => (
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
        <button
          onClick={() => void save()}
          disabled={saving || remaining !== 0 || splits.length === 0}
        >
          Save splits
        </button>
      </section>
      <button onClick={() => setTransferOpen(true)}>Mark as transfer</button>
      {transaction.amountMinor > 0 ? (
        <RefundRelationshipEditor
          transaction={transaction}
          candidates={allTransactions}
          csrfToken={csrfToken}
          authorizeTransactionEdit={authorizeTransactionEdit}
          onChange={onChange}
        />
      ) : null}
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
          <button onClick={() => void confirmTransfer()} disabled={saving || !otherSide}>
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
          authorizeDecision={authorizeReconciliation}
          onResolved={onReconciled}
        />
      ) : null}
      <button onClick={() => void onPreviewRemoval()}>Preview transaction removal</button>
      {removalImpact ? (
        <section aria-label="Transaction removal impact">
          <strong>{removalImpact.outcome}</strong>
          <p>Preserved: {removalImpact.preservedRecordTypes.join(', ') || 'audit record'}</p>
        </section>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
