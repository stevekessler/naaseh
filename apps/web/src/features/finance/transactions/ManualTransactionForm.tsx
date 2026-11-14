import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createUlid, currencyExponentFor } from '@naaseh/domain';
import { queueEncryptedManualTransaction } from '../../../db/finance-repository.js';
import { financeRequest } from '../finance-client.js';
import { peekFinanceAccess } from '../security/finance-access.js';

export type ManualTransactionAccount = {
  id: string;
  friendlyName: string;
  currency: string;
  currencyExponent?: number;
  version?: number;
  connectionId?: string;
  status?: string;
  scope?: { type: 'owner'; ownerId: string } | { type: 'group'; groupId: string };
};
export type ManualTransactionMerchant = { id: string; name: string; status?: string };
export type ManualTransactionCategory = {
  id: string;
  name: string;
  version?: number;
  parentId?: string;
  status?: string;
};

export function ManualTransactionForm({
  accounts,
  selectedAccountId,
  accountLocked = false,
  merchants,
  categories,
  csrfToken,
  authorizeEdit,
  onSaved,
}: {
  accounts: readonly ManualTransactionAccount[];
  selectedAccountId?: string;
  accountLocked?: boolean;
  merchants?: readonly ManualTransactionMerchant[];
  categories?: readonly ManualTransactionCategory[];
  csrfToken: string;
  authorizeEdit?: () => Promise<boolean>;
  onSaved?: (transaction: Record<string, unknown>, queued: boolean) => Promise<void> | void;
}) {
  const eligible = useMemo(
    () => accounts.filter(({ status }) => !status || status === 'active' || status === 'attention'),
    [accounts],
  );
  const [accountId, setAccountId] = useState(selectedAccountId ?? eligible[0]?.id ?? '');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'debit' | 'credit'>('debit');
  const [description, setDescription] = useState('');
  const [payee, setPayee] = useState('');
  const [memo, setMemo] = useState('');
  const [paymentType, setPaymentType] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [allocationNote, setAllocationNote] = useState('');
  const [merchantOptions, setMerchantOptions] = useState<readonly ManualTransactionMerchant[]>(
    merchants ?? [],
  );
  const [categoryOptions, setCategoryOptions] = useState<readonly ManualTransactionCategory[]>(
    categories ?? [],
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const intent = useRef<
    | {
        fingerprint: string;
        idempotencyKey: string;
        transactionId: string;
        allocationId: string;
      }
    | undefined
  >(undefined);

  const resetAcceptedDraft = () => {
    setAmount('');
    setDescription('');
    setPayee('');
    setMemo('');
    setPaymentType('');
    setCheckNumber('');
    setMerchantId('');
    setCategoryId('');
    setAllocationNote('');
    intent.current = undefined;
  };

  useEffect(() => {
    if (merchants) setMerchantOptions(merchants);
    if (categories) setCategoryOptions(categories);
    if (merchants && categories) return;
    let active = true;
    const clear = () => {
      if (active) {
        setMerchantOptions([]);
        setCategoryOptions([]);
      }
    };
    const unsubscribe = peekFinanceAccess()?.onLock(clear);
    void Promise.all([
      merchants
        ? Promise.resolve({ items: merchants })
        : financeRequest<{ items: ManualTransactionMerchant[] }>('/finance/merchants'),
      categories
        ? Promise.resolve({ items: categories })
        : financeRequest<{ items: ManualTransactionCategory[] }>('/finance/categories'),
    ])
      .then(([merchantPage, categoryPage]) => {
        if (!active) return;
        setMerchantOptions(merchantPage.items);
        setCategoryOptions(categoryPage.items);
      })
      .catch(clear);
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [categories, merchants]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const account = eligible.find(({ id }) => id === accountId);
    if (!account) return setError('Choose an account you may edit.');
    if (!date) return setError('Transaction date is required.');
    if (!description.trim()) return setError('Description is required.');
    const exponent = account.currencyExponent ?? currencyExponentFor(account.currency);
    const numeric = Number(amount);
    const scaled = numeric * 10 ** exponent;
    if (!(numeric > 0) || !Number.isSafeInteger(scaled))
      return setError('Enter an exact positive amount.');
    setSaving(true);
    setError('');
    setMessage('');
    const amountMinor = Math.round(scaled) * (direction === 'debit' ? -1 : 1);
    const transactedAt = `${date}T12:00:00.000Z`;
    const selectedCategory = categoryOptions.find(({ id }) => id === categoryId);
    const baseBusiness = {
      expectedAccountVersion: account.version ?? 1,
      amountMinor,
      transactedAt,
      description: description.trim(),
      ...(payee.trim() ? { payee: payee.trim() } : {}),
      ...(memo.trim() ? { memo: memo.trim() } : {}),
      ...(merchantId ? { merchantId } : {}),
      ...(paymentType ? { paymentType } : {}),
      ...(checkNumber.trim() ? { checkNumber: checkNumber.trim() } : {}),
    };
    const fingerprint = JSON.stringify([account.id, baseBusiness, categoryId, allocationNote]);
    if (!intent.current || intent.current.fingerprint !== fingerprint)
      intent.current = {
        fingerprint,
        idempotencyKey: crypto.randomUUID(),
        transactionId: createUlid(),
        allocationId: createUlid(),
      };
    const draft = intent.current;
    const allocations = selectedCategory
      ? [
          {
            id: draft.allocationId,
            amountMinor,
            financeCategoryId: selectedCategory.id,
            ...(allocationNote.trim() ? { note: allocationNote.trim() } : {}),
          },
        ]
      : [];
    const business = {
      ...baseBusiness,
      ...(allocations.length ? { allocations } : {}),
    };
    try {
      if (authorizeEdit && !(await authorizeEdit())) return;
      if (!navigator.onLine) {
        const transaction = {
          id: draft.transactionId,
          accountId: account.id,
          origin: 'manual',
          amountMinor,
          currency: account.currency,
          currencyExponent: exponent,
          transactedAt,
          effectiveAt: transactedAt,
          description: description.trim(),
          ...(payee.trim() ? { payee: payee.trim() } : {}),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
          ...(merchantId ? { merchantId } : {}),
          ...(paymentType ? { paymentType } : {}),
          ...(checkNumber.trim() ? { checkNumber: checkNumber.trim() } : {}),
          pending: false,
          entrySnapshot: {
            amountMinor,
            currency: account.currency,
            transactedAt,
            description: description.trim(),
            pending: false,
            ...(payee.trim() ? { payee: payee.trim() } : {}),
            ...(memo.trim() ? { memo: memo.trim() } : {}),
            ...(paymentType ? { paymentType } : {}),
            ...(checkNumber.trim() ? { checkNumber: checkNumber.trim() } : {}),
          },
          allocations: selectedCategory
            ? allocations.map((allocation) => ({
                ...allocation,
                classification: {
                  categoryId: selectedCategory.id,
                  categoryLabel: selectedCategory.name,
                  categoryVersion: selectedCategory.version ?? 1,
                },
              }))
            : [],
          reconciliationState: account.connectionId ? 'provisional' : 'not-applicable',
          reviewState: 'none',
          status: 'active',
          version: 1,
        };
        await queueEncryptedManualTransaction({
          transaction,
          payloadValue: { id: draft.transactionId, accountId: account.id, ...business },
          scopeKey:
            account.scope?.type === 'group'
              ? `GROUP#${account.scope.groupId}`
              : `OWNER#${account.scope?.ownerId ?? 'LOCAL'}`,
        });
        setMessage('Transaction queued securely. It remains pending until synchronization.');
        await onSaved?.(transaction, true);
        resetAcceptedDraft();
        return;
      }
      const created = await financeRequest<Record<string, unknown>>(
        `/finance/accounts/${encodeURIComponent(account.id)}/transactions`,
        {
          method: 'POST',
          csrfToken,
          idempotencyKey: draft.idempotencyKey,
          body: JSON.stringify(business),
        },
      );
      const createdId = typeof created.id === 'string' ? created.id : '';
      const canonical = await financeRequest<Record<string, unknown>>(
        `/finance/transactions/${encodeURIComponent(createdId)}`,
        { csrfToken },
      );
      if (!createdId || canonical.id !== createdId || canonical.accountId !== account.id)
        throw new Error('Canonical transaction mismatch.');
      setMessage(
        canonical.reconciliationState === 'provisional'
          ? 'Transaction saved as provisional. Provider balance was not changed.'
          : 'Transaction saved.',
      );
      await onSaved?.(canonical, false);
      resetAcceptedDraft();
    } catch {
      setError('The transaction could not be saved. Your entries are still here.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="manual-transaction-form" onSubmit={(event) => void submit(event)}>
      <label>
        Account
        <select
          aria-label="Account"
          value={accountId}
          disabled={accountLocked}
          onChange={(event) => setAccountId(event.target.value)}
        >
          {eligible.map((account) => (
            <option key={account.id} value={account.id}>
              {account.friendlyName}
            </option>
          ))}
        </select>
      </label>
      <label>
        Transaction date
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <label>
        Amount
        <input
          inputMode="decimal"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label>
        Direction
        <select
          value={direction}
          onChange={(event) => setDirection(event.target.value as 'debit' | 'credit')}
        >
          <option value="debit">Debit / expense</option>
          <option value="credit">Credit / income</option>
        </select>
      </label>
      <label>
        Description
        <input value={description} onChange={(event) => setDescription(event.target.value)} />
      </label>
      <label>
        Payee
        <input value={payee} onChange={(event) => setPayee(event.target.value)} />
      </label>
      <label>
        Merchant
        <select value={merchantId} onChange={(event) => setMerchantId(event.target.value)}>
          <option value="">Unspecified</option>
          {merchantOptions
            .filter(({ status }) => !status || status === 'active')
            .map((merchant) => (
              <option key={merchant.id} value={merchant.id}>
                {merchant.name}
              </option>
            ))}
        </select>
      </label>
      <label>
        Category allocation
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          <option value="">Unallocated</option>
          {categoryOptions
            .filter(({ status, parentId }) => (!status || status === 'active') && !parentId)
            .map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
        </select>
      </label>
      {categoryId ? (
        <label>
          Allocation note
          <input
            value={allocationNote}
            onChange={(event) => setAllocationNote(event.target.value)}
          />
        </label>
      ) : null}
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
        <input value={checkNumber} onChange={(event) => setCheckNumber(event.target.value)} />
      </label>
      <label>
        Memo
        <textarea value={memo} onChange={(event) => setMemo(event.target.value)} />
      </label>
      <button type="submit" disabled={saving || !eligible.length}>
        Save transaction
      </button>
      {error ? <p role="alert">{error}</p> : null}
      {message ? <p role="status">{message}</p> : null}
    </form>
  );
}
