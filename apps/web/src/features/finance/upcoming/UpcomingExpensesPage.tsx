import { useMemo } from 'react';
import type { UpcomingExpenseView } from './types.js';
import { formatUpcomingMoney } from './types.js';

export function UpcomingExpensesPage({
  items,
  loading = false,
  error,
  onRetry,
  onCreate,
  onOpenExpense,
  onOpenAccount,
}: {
  items: UpcomingExpenseView[];
  loading?: boolean;
  error?: string;
  onRetry: () => void;
  onCreate: () => void;
  onOpenExpense: (expenseId: string) => void;
  onOpenAccount: (accountId: string) => void;
}) {
  const unpaid = useMemo(
    () =>
      items
        .filter(({ state }) => state !== 'paid' && state !== 'cancelled')
        .sort(
          (left, right) =>
            left.expense.dueDate.localeCompare(right.expense.dueDate) ||
            left.expense.id.localeCompare(right.expense.id),
        ),
    [items],
  );
  return (
    <section aria-labelledby="upcoming-expenses-title">
      <header>
        <h2 id="upcoming-expenses-title">Upcoming expenses</h2>
        <p>Plan obligations here without posting a payment or changing an account balance.</p>
        <button type="button" onClick={onCreate}>
          Add upcoming expense
        </button>
      </header>
      {loading ? <p role="status">Loading upcoming expenses…</p> : null}
      {error ? (
        <section role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            Try again
          </button>
        </section>
      ) : null}
      {!loading && !error && unpaid.length === 0 ? (
        <p>No unpaid upcoming expenses are visible.</p>
      ) : null}
      {unpaid.length ? (
        <ol aria-label="Unpaid upcoming expenses">
          {unpaid.map(({ expense, state, remainingAmountMinor }) => (
            <li key={expense.id}>
              <article>
                <h3>{expense.description}</h3>
                <p>
                  {formatUpcomingMoney(
                    remainingAmountMinor,
                    expense.currency,
                    expense.currencyExponent,
                  )}{' '}
                  remaining · Due {expense.dueDate} · {state.replaceAll('-', ' ')}
                </p>
                <button type="button" onClick={() => onOpenExpense(expense.id)}>
                  Review expense
                </button>
                <button type="button" onClick={() => onOpenAccount(expense.accountId)}>
                  Open account
                </button>
              </article>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
