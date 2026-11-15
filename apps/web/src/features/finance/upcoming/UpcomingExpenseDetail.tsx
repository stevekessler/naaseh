import { FormEvent, useState } from 'react';
import { localFinanceDate, parseMajorUnits } from '@naaseh/domain';
import type { UpcomingExpenseView } from './types.js';
import { formatUpcomingMoney } from './types.js';

export interface EligibleExpenseTransaction {
  id: string;
  description: string;
  amountMinor: number;
  version: number;
  claimVersion: number;
}

export function UpcomingExpenseDetail({
  value,
  eligibleTransactions,
  now = () => new Date(),
  onReschedule,
  onCancel,
  onLinkPayment,
  onUnlinkPayment,
  onOpenAccount,
}: {
  value: UpcomingExpenseView;
  eligibleTransactions: EligibleExpenseTransaction[];
  now?: () => Date;
  onReschedule: (input: {
    dueDate: string;
    dateChangeContext: { enteredAt: string; localDate: string; timeZone: string };
    expectedVersion: number;
  }) => Promise<void>;
  onCancel: (expectedVersion: number) => Promise<void>;
  onLinkPayment: (input: {
    transactionId: string;
    amountMinor: number;
    expectedExpenseVersion: number;
    expectedTransactionVersion: number;
    expectedClaimVersion: number;
  }) => Promise<void>;
  onUnlinkPayment: (fulfillmentId: string) => Promise<void>;
  onOpenAccount: (accountId: string) => void;
}) {
  const { expense } = value;
  const [dueDate, setDueDate] = useState(expense.dueDate);
  const [transactionId, setTransactionId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch {
      setError('The change was not saved. Review current access and try again.');
    } finally {
      setBusy(false);
    }
  };
  const reschedule = (event: FormEvent) => {
    event.preventDefault();
    const entered = now();
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const dateChangeContext = {
      enteredAt: entered.toISOString(),
      localDate: localFinanceDate(entered.toISOString(), timeZone),
      timeZone,
    };
    if (dueDate <= dateChangeContext.localDate) {
      setError('Choose a date after today in this browser’s local calendar.');
      return;
    }
    void run(() => onReschedule({ dueDate, dateChangeContext, expectedVersion: expense.version }));
  };
  const link = (event: FormEvent) => {
    event.preventDefault();
    const transaction = eligibleTransactions.find(({ id }) => id === transactionId);
    if (!transaction) {
      setError('Choose an eligible expense transaction.');
      return;
    }
    let amountMinor: number;
    try {
      amountMinor = parseMajorUnits(amount, expense.currency);
      if (amountMinor <= 0) throw new Error('positive amount required');
    } catch {
      setError(`Enter a positive amount in ${expense.currency}.`);
      return;
    }
    void run(() =>
      onLinkPayment({
        transactionId,
        amountMinor,
        expectedExpenseVersion: expense.version,
        expectedTransactionVersion: transaction.version,
        expectedClaimVersion: transaction.claimVersion,
      }),
    );
  };
  return (
    <article aria-labelledby="upcoming-expense-detail-title">
      <header>
        <h2 id="upcoming-expense-detail-title">{expense.description}</h2>
        <p>
          Expected{' '}
          {formatUpcomingMoney(
            expense.expectedAmountMinor,
            expense.currency,
            expense.currencyExponent,
          )}{' '}
          · {value.state.replaceAll('-', ' ')}
        </p>
        <p>
          Fulfilled{' '}
          {formatUpcomingMoney(
            value.fulfilledAmountMinor,
            expense.currency,
            expense.currencyExponent,
          )}{' '}
          · Remaining{' '}
          {formatUpcomingMoney(
            value.remainingAmountMinor,
            expense.currency,
            expense.currencyExponent,
          )}
        </p>
        <button type="button" onClick={() => onOpenAccount(expense.accountId)}>
          Open account
        </button>
      </header>
      <section aria-labelledby="reschedule-upcoming-title">
        <h3 id="reschedule-upcoming-title">Reschedule</h3>
        <form onSubmit={reschedule}>
          <label>
            New date
            <input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <button disabled={busy} type="submit">
            Save new date
          </button>
        </form>
      </section>
      <section aria-labelledby="fulfill-upcoming-title">
        <h3 id="fulfill-upcoming-title">Record a payment reference</h3>
        <p>Linking confirms what a posted transaction fulfills. It never posts money again.</p>
        <form onSubmit={link}>
          <label>
            Expense transaction
            <select
              value={transactionId}
              onChange={(event) => setTransactionId(event.target.value)}
            >
              <option value="">Choose a transaction</option>
              {eligibleTransactions.map((transaction) => (
                <option key={transaction.id} value={transaction.id}>
                  {transaction.description} —{' '}
                  {formatUpcomingMoney(
                    -transaction.amountMinor,
                    expense.currency,
                    expense.currencyExponent,
                  )}
                </option>
              ))}
            </select>
          </label>
          <label>
            Amount fulfilled
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              inputMode="decimal"
            />
          </label>
          <button disabled={busy} type="submit">
            Link payment
          </button>
        </form>
        <ul aria-label="Payment references">
          {value.fulfillments.map((fulfillment) => (
            <li key={fulfillment.id}>
              {formatUpcomingMoney(
                fulfillment.amountMinor,
                fulfillment.currency,
                fulfillment.currencyExponent,
              )}{' '}
              · {fulfillment.calculationState.replaceAll('-', ' ')}
              {fulfillment.status === 'active' ? (
                <button
                  disabled={busy}
                  type="button"
                  onClick={() => void run(() => onUnlinkPayment(fulfillment.id))}
                >
                  Remove reference
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      {expense.lifecycle === 'active' ? (
        <button
          disabled={busy}
          type="button"
          onClick={() => void run(() => onCancel(expense.version))}
        >
          Cancel upcoming expense
        </button>
      ) : null}
      {error ? <p role="alert">{error}</p> : null}
    </article>
  );
}
