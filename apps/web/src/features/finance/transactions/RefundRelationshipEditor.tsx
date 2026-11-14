import { useEffect, useMemo, useState } from 'react';
import type { TransactionView } from './TransactionDetail.js';
import { financeRequest } from '../finance-client.js';

type RelationshipEnvelope = {
  relationship: {
    version: number;
    originalExpenseTransactionId: string;
    linkedAmountMinor: number;
    status: 'active' | 'removed';
    calculationState: 'valid' | 'awaiting-posting' | 'needs-review';
    refundedAllocations: Array<{ originalAllocationId: string; amountMinor: number }>;
  };
  creditCapacityVersion: number;
  allocationCapacityVersions: Record<string, number>;
};

const decimalAmount = (minor: number, exponent: number) => String(minor / 10 ** exponent);

export function RefundRelationshipEditor({
  transaction,
  candidates,
  csrfToken,
  authorizeTransactionEdit,
  onChange,
}: {
  transaction: TransactionView;
  candidates: TransactionView[];
  csrfToken: string;
  authorizeTransactionEdit: (
    expected: ReadonlyArray<Pick<TransactionView, 'id' | 'version'>>,
  ) => Promise<boolean>;
  onChange: (relatedIds?: readonly string[]) => Promise<boolean>;
}) {
  const [envelope, setEnvelope] = useState<RelationshipEnvelope>();
  const [originalId, setOriginalId] = useState('');
  const [linkedAmount, setLinkedAmount] = useState(
    decimalAmount(transaction.amountMinor, transaction.currencyExponent),
  );
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const originals = useMemo(
    () =>
      candidates.filter(
        (candidate) =>
          candidate.id !== transaction.id &&
          candidate.amountMinor < 0 &&
          candidate.currency === transaction.currency &&
          !candidate.transferId,
      ),
    [candidates, transaction],
  );
  const original = originals.find(({ id }) => id === originalId);
  useEffect(() => {
    let current = true;
    void financeRequest<RelationshipEnvelope>(
      `/finance/transactions/${encodeURIComponent(transaction.id)}/refund-relationship`,
    )
      .then((value) => {
        if (!current) return;
        setEnvelope(value);
        setOriginalId(value.relationship.originalExpenseTransactionId);
        setLinkedAmount(
          decimalAmount(value.relationship.linkedAmountMinor, transaction.currencyExponent),
        );
        setAllocationAmounts(
          Object.fromEntries(
            value.relationship.refundedAllocations.map((allocation) => [
              allocation.originalAllocationId,
              decimalAmount(allocation.amountMinor, transaction.currencyExponent),
            ]),
          ),
        );
        setConfirmed(true);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [transaction.currencyExponent, transaction.id]);
  const selectOriginal = (id: string) => {
    const selected = originals.find((candidate) => candidate.id === id);
    setOriginalId(id);
    setConfirmed(false);
    if (!selected) {
      setAllocationAmounts({});
      return;
    }
    const fullMinor = Math.min(transaction.amountMinor, -selected.amountMinor);
    setLinkedAmount(decimalAmount(fullMinor, transaction.currencyExponent));
    setAllocationAmounts(
      Object.fromEntries(
        selected.allocations.map((allocation) => [
          allocation.id,
          decimalAmount(-allocation.amountMinor, transaction.currencyExponent),
        ]),
      ),
    );
  };
  const save = async () => {
    if (!original || saving) return;
    const linkedAmountMinor = Math.round(Number(linkedAmount) * 10 ** transaction.currencyExponent);
    const partial = linkedAmountMinor !== -original.amountMinor;
    const refundedAllocations = original.allocations.map((allocation) => ({
      originalAllocationId: allocation.id,
      amountMinor: Math.round(
        Number(allocationAmounts[allocation.id] ?? 0) * 10 ** transaction.currencyExponent,
      ),
    })).filter(({ amountMinor }) => amountMinor > 0);
    if (
      !Number.isSafeInteger(linkedAmountMinor) ||
      linkedAmountMinor <= 0 ||
      linkedAmountMinor > transaction.amountMinor ||
      (partial && original.allocations.length > 1 && !confirmed)
    ) {
      setMessage('Confirm the original allocation amounts for this partial refund.');
      return;
    }
    setSaving(true);
    try {
      if (!(await authorizeTransactionEdit([transaction]))) return;
      const allocationIds = new Set([
        ...original.allocations.map(({ id }) => id),
        ...Object.keys(envelope?.allocationCapacityVersions ?? {}),
      ]);
      const saved = await financeRequest<RelationshipEnvelope>(
        `/finance/transactions/${encodeURIComponent(transaction.id)}/refund-relationship`,
        {
          method: 'PUT',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            originalExpenseTransactionId: original.id,
            linkedAmountMinor,
            ...(partial || envelope ? { refundedAllocations } : {}),
            confirmedPartialAllocations: partial ? confirmed : false,
            expectedRefundVersion: transaction.version,
            expectedOriginalVersion: original.version,
            ...(envelope ? { expectedRelationshipVersion: envelope.relationship.version } : {}),
            expectedCreditCapacityVersion: envelope?.creditCapacityVersion ?? 0,
            expectedAllocationCapacityVersions: Object.fromEntries(
              [...allocationIds].map((id) => [
                id,
                envelope?.allocationCapacityVersions[id] ?? 0,
              ]),
            ),
          }),
        },
      );
      setEnvelope(saved);
      if (await onChange([original.id])) setMessage('Refund link saved.');
    } catch {
      setMessage('Refund link changed or capacity is no longer available. Refresh and review it.');
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!envelope || saving) return;
    setSaving(true);
    try {
      if (!(await authorizeTransactionEdit([transaction]))) return;
      await financeRequest(
        `/finance/transactions/${encodeURIComponent(transaction.id)}/refund-relationship`,
        {
          method: 'DELETE',
          csrfToken,
          idempotencyKey: crypto.randomUUID(),
          body: JSON.stringify({
            expectedRelationshipVersion: envelope.relationship.version,
            expectedCreditCapacityVersion: envelope.creditCapacityVersion,
            expectedAllocationCapacityVersions: envelope.allocationCapacityVersions,
          }),
        },
      );
      setEnvelope(undefined);
      if (await onChange([envelope.relationship.originalExpenseTransactionId]))
        setMessage('Refund link removed. The credit no longer offsets spending.');
    } catch {
      setMessage('Refund link could not be removed. Refresh and review it.');
    } finally {
      setSaving(false);
    }
  };
  return (
    <section aria-label="Expense refund relationship">
      <h3>Expense refund</h3>
      <p>
        This credit keeps its received date{' '}
        {transaction.effectiveAt ? new Date(transaction.effectiveAt).toLocaleDateString() : 'shown above'}.
        Unlinked credits do not reduce spending.
      </p>
      {envelope ? <p>Current state: {envelope.relationship.calculationState}</p> : null}
      <label>
        Original expense
        <select value={originalId} onChange={(event) => selectOriginal(event.target.value)}>
          <option value="">Choose an accessible expense</option>
          {originals.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.description}
            </option>
          ))}
        </select>
      </label>
      <label>
        Linked refund amount
        <input
          inputMode="decimal"
          value={linkedAmount}
          onChange={(event) => setLinkedAmount(event.target.value)}
        />
      </label>
      {original?.allocations.map((allocation) => (
        <label key={allocation.id}>
          Refunded amount for allocation {allocation.id}
          <input
            inputMode="decimal"
            value={allocationAmounts[allocation.id] ?? ''}
            onChange={(event) =>
              setAllocationAmounts((current) => ({
                ...current,
                [allocation.id]: event.target.value,
              }))
            }
          />
        </label>
      ))}
      {original && original.allocations.length > 1 ? (
        <label>
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm these original allocation amounts
        </label>
      ) : null}
      <button type="button" disabled={!original || saving} onClick={() => void save()}>
        {envelope ? 'Correct refund link' : 'Link refund to original expense'}
      </button>
      {envelope ? (
        <button type="button" disabled={saving} onClick={() => void remove()}>
          Remove refund link
        </button>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
