import type { UpcomingExpenseView } from '../upcoming/types.js';
import { formatUpcomingMoney } from '../upcoming/types.js';

export function UpcomingExpensesWidget({
  items,
  onOpenExpense,
}: {
  items: UpcomingExpenseView[];
  onOpenExpense: (expenseId: string) => void;
}) {
  const canonical = new Map<string, UpcomingExpenseView>();
  for (const item of items) {
    if (item.state === 'paid' || item.state === 'cancelled') continue;
    const source = item.expense.plannedSource;
    const key = source
      ? source.type === 'budgetItem'
        ? `budgetItem:${source.budgetItemId}`
        : `reusableOccurrence:${source.reusableItemId}:${source.occurrenceDate}`
      : `expense:${item.expense.id}`;
    const previous = canonical.get(key);
    if (!previous || item.expense.version > previous.expense.version) canonical.set(key, item);
  }
  const sorted = [...canonical.values()].sort(
    (left, right) =>
      left.expense.dueDate.localeCompare(right.expense.dueDate) ||
      left.expense.id.localeCompare(right.expense.id),
  );
  const overdue = sorted.filter(({ state }) => state.includes('overdue'));
  const upcoming = sorted.filter(({ state }) => !state.includes('overdue')).slice(0, 10);
  const rows = (values: UpcomingExpenseView[]) => (
    <ul>
      {values.map(({ expense, remainingAmountMinor }) => (
        <li key={expense.id}>
          <button type="button" onClick={() => onOpenExpense(expense.id)}>
            {expense.description} —{' '}
            {formatUpcomingMoney(remainingAmountMinor, expense.currency, expense.currencyExponent)}{' '}
            — {expense.dueDate}
          </button>
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="dashboard-upcoming-title">
      <h3 id="dashboard-upcoming-title">Upcoming expenses</h3>
      {upcoming.length ? rows(upcoming) : <p>No unpaid upcoming expenses.</p>}
      {overdue.length ? (
        <section aria-labelledby="dashboard-overdue-title">
          <h4 id="dashboard-overdue-title">Overdue</h4>
          {rows(overdue)}
        </section>
      ) : null}
    </section>
  );
}
