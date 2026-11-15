// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpcomingExpense } from '@naaseh/domain';
import { UpcomingExpenseDetail } from '../../src/features/finance/upcoming/UpcomingExpenseDetail.js';
import { UpcomingExpensesPage } from '../../src/features/finance/upcoming/UpcomingExpensesPage.js';
import type { UpcomingExpenseView } from '../../src/features/finance/upcoming/types.js';
import { UpcomingExpensesWidget } from '../../src/features/finance/dashboard/UpcomingExpensesWidget.js';

afterEach(cleanup);

const id = (ordinal: number) => `01K${String(ordinal).padStart(23, '0')}`;
const view = (
  ordinal: number,
  dueDate: string,
  state: UpcomingExpenseView['state'] = 'upcoming',
): UpcomingExpenseView => ({
  expense: createUpcomingExpense({
    id: id(ordinal),
    groupId: id(1),
    accountId: id(2),
    budgetId: id(3),
    description: `Expense ${ordinal}`,
    expectedAmountMinor: 2_500,
    currency: 'USD',
    dueDate,
    entryContext: {
      enteredAt: '2026-10-31T18:00:00.000Z',
      localDate: '2026-10-31',
      timeZone: 'America/Denver',
    },
    creatorId: 'owner',
    acceptedAt: '2026-11-01T00:00:00.000Z',
  }),
  fulfillments: [],
  claimVersions: {},
  fulfilledAmountMinor: 0,
  remainingAmountMinor: 2_500,
  overpaidAmountMinor: 0,
  state,
});

describe('upcoming expense web experience', () => {
  it('shows only unpaid obligations in due-date order and wires expense/account actions', () => {
    const openExpense = vi.fn();
    const openAccount = vi.fn();
    const items = [
      view(903, '2026-11-10'),
      view(901, '2026-11-02'),
      view(902, '2026-11-03', 'paid'),
    ];
    const rendered = render(
      <UpcomingExpensesPage
        items={items}
        onRetry={vi.fn()}
        onCreate={vi.fn()}
        onOpenExpense={openExpense}
        onOpenAccount={openAccount}
      />,
    );
    const reviews = rendered.getAllByRole('button', { name: 'Review expense' });
    expect(reviews).toHaveLength(2);
    expect(rendered.queryByText('Expense 902')).toBeNull();
    fireEvent.click(reviews[0]!);
    expect(openExpense).toHaveBeenCalledWith(id(901));
    fireEvent.click(rendered.getAllByRole('button', { name: 'Open account' })[0]!);
    expect(openAccount).toHaveBeenCalledWith(id(2));
  });

  it('keeps overdue obligations separate and limits the default upcoming list to ten', () => {
    const items = [view(920, '2026-11-01', 'overdue')];
    for (let ordinal = 921; ordinal <= 932; ordinal++)
      items.push(view(ordinal, `2026-11-${String(ordinal - 920).padStart(2, '0')}`));
    const rendered = render(<UpcomingExpensesWidget items={items} onOpenExpense={vi.fn()} />);
    expect(rendered.getByRole('heading', { name: 'Overdue' })).toBeTruthy();
    expect(rendered.getByText(/Expense 920/u)).toBeTruthy();
    expect(rendered.getAllByRole('button')).toHaveLength(11);
    expect(rendered.queryByText(/Expense 931/u)).toBeNull();
  });

  it('explains reference-only payment linking and exposes reschedule, cancel and account actions', () => {
    const cancel = vi.fn().mockResolvedValue(undefined);
    const openAccount = vi.fn();
    const rendered = render(
      <UpcomingExpenseDetail
        value={view(940, '2026-11-12')}
        eligibleTransactions={[]}
        onReschedule={vi.fn().mockResolvedValue(undefined)}
        onCancel={cancel}
        onLinkPayment={vi.fn().mockResolvedValue(undefined)}
        onUnlinkPayment={vi.fn().mockResolvedValue(undefined)}
        onOpenAccount={openAccount}
      />,
    );
    expect(rendered.getByText(/never posts money again/i)).toBeTruthy();
    expect(rendered.getByLabelText('New date')).toBeTruthy();
    fireEvent.click(rendered.getByRole('button', { name: 'Cancel upcoming expense' }));
    expect(cancel).toHaveBeenCalledWith(1);
    fireEvent.click(rendered.getByRole('button', { name: 'Open account' }));
    expect(openAccount).toHaveBeenCalledWith(id(2));
  });
});
