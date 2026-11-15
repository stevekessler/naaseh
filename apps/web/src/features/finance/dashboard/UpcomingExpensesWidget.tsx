import {
  defaultFinanceDashboardSettings,
  financeDashboardUpcomingCountSchema,
  financeDashboardUpcomingCounts,
  selectDashboardUpcoming,
} from '@naaseh/domain';
import type { UpcomingExpenseView } from '../upcoming/types.js';
import { formatUpcomingMoney } from '../upcoming/types.js';
import { DashboardFlagStatus, type DashboardPreferences } from './DashboardFlagControl.js';

export function UpcomingExpensesWidget({
  items,
  state = 'ready',
  preferences,
  onRefresh,
  onOpenExpense,
}: {
  items?: UpcomingExpenseView[] | undefined;
  state?: 'checking' | 'ready' | 'unavailable';
  preferences?: DashboardPreferences;
  onRefresh?: () => void;
  onOpenExpense: (expenseId: string) => void;
}) {
  const limit =
    preferences?.settings?.upcomingCount ?? defaultFinanceDashboardSettings.upcomingCount;
  const { overdue, upcoming } = selectDashboardUpcoming(items ?? [], limit);
  const rows = (values: UpcomingExpenseView[]) => (
    <ul>
      {values.map(({ expense, remainingAmountMinor }) => (
        <li key={expense.id}>
          <button type="button" onClick={() => onOpenExpense(expense.id)}>
            {expense.description} —{' '}
            {formatUpcomingMoney(
              expense.expectedAmountMinor,
              expense.currency,
              expense.currencyExponent,
            )}{' '}
            — {expense.dueDate}
          </button>
          {remainingAmountMinor < expense.expectedAmountMinor ? (
            <span>
              {' '}
              {formatUpcomingMoney(
                remainingAmountMinor,
                expense.currency,
                expense.currencyExponent,
              )}{' '}
              remaining
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
  return (
    <section aria-labelledby="dashboard-upcoming-title">
      <h3 id="dashboard-upcoming-title">Upcoming expenses</h3>
      {preferences ? (
        <>
          <label>
            Number of upcoming expenses
            <select
              value={limit}
              disabled={!preferences.settings || preferences.pending}
              onChange={(event) => {
                const result = financeDashboardUpcomingCountSchema.safeParse(
                  Number(event.target.value),
                );
                if (result.success) void preferences.changeUpcomingCount(result.data);
              }}
            >
              {financeDashboardUpcomingCounts.map((count) => (
                <option key={count} value={count}>
                  {count}
                </option>
              ))}
            </select>
          </label>
          <DashboardFlagStatus preferences={preferences} />
          {preferences.feedback?.kind === 'settings' ? (
            <p role="status">{preferences.feedback.text}</p>
          ) : null}
        </>
      ) : null}
      {state === 'checking' ? <p role="status">Checking upcoming expenses…</p> : null}
      {state === 'unavailable' ? (
        <>
          <p>Upcoming expenses are unavailable.</p>
          {onRefresh ? (
            <button type="button" onClick={onRefresh}>
              Refresh upcoming expenses
            </button>
          ) : null}
        </>
      ) : null}
      {state === 'ready' ? (
        <>
          {upcoming.length ? rows(upcoming) : <p>No unpaid upcoming expenses.</p>}
          {overdue.length ? (
            <section aria-labelledby="dashboard-overdue-title">
              <h4 id="dashboard-overdue-title">Overdue</h4>
              {rows(overdue)}
            </section>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
