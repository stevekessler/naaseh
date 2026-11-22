// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  return {
    request: vi.fn(),
    dispose: vi.fn(),
    preferences: vi.fn(),
    listeners,
    access: {
      canRead: () => true,
      onLock: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  };
});

vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => f.access,
  subscribeFinanceAccess: () => () => undefined,
}));
vi.mock('../../src/features/finance/finance-client.js', () => ({
  financeRequest: f.preferences,
}));
vi.mock('../../src/sync/finance-api-snapshot.js', () => ({
  loadFinanceApiSnapshot: async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }),
  readFinanceApiSnapshot: async (snapshot: { value: unknown }, read: (value: unknown) => unknown) =>
    read(snapshot.value),
  disposeFinanceApiSnapshot: f.dispose,
}));

const accountId = '01J00000000000000000000001';
const unselectedId = '01J00000000000000000000002';
const settings = (upcomingCount = 10, version = 0) => ({
  flags: [{ targetKind: 'account', targetId: accountId, included: true, version: 1 }],
  settings: { upcomingCount, version },
});

import { FinanceDashboardPage } from '../../src/features/finance/dashboard/FinanceDashboardPage.js';

beforeEach(() => {
  vi.resetAllMocks();
  f.preferences.mockResolvedValue(settings());
  f.listeners.clear();
});
afterEach(cleanup);

describe('protected Finance dashboard', () => {
  it('shows a truthful confirmed empty state without fabricated balances', async () => {
    f.request.mockResolvedValue({ items: [] });
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={vi.fn()}
        onOpenBudget={vi.fn()}
        onOpenTransaction={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await view.findByRole('region', { name: 'Empty Finance dashboard' });
    expect(view.getByText('No accounts yet')).toBeTruthy();
    expect(view.getByText(/No balance data is available/u)).toBeTruthy();
  });

  it('renders canonical account freshness and opens the selected account', async () => {
    f.request.mockImplementation(async (path: string) => ({
      items:
        path === '/finance/accounts'
          ? [
              {
                id: accountId,
                friendlyName: 'Household checking',
                currency: 'USD',
                currencyExponent: 2,
                currentBalanceMinor: 12345,
                freshness: { lastUpdatedAt: '2026-11-13T12:00:00.000Z', stale: true },
              },
              {
                id: unselectedId,
                friendlyName: 'Unselected account',
                currency: 'USD',
                currencyExponent: 2,
                currentBalanceMinor: 888,
              },
            ]
          : [],
    }));
    const open = vi.fn();
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={open}
        onOpenBudget={vi.fn()}
        onOpenTransaction={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await view.findByRole('region', { name: 'Dashboard accounts' });
    expect(view.getByText('$123.45')).toBeTruthy();
    expect(
      within(view.getByRole('region', { name: 'Dashboard accounts' })).queryByText(
        'Unselected account',
      ),
    ).toBeNull();
    expect(view.getByText('Refresh recommended')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Open account' }));
    expect(open).toHaveBeenCalledWith(accountId);
  });

  it('shows budget overspending and opens a transaction from each watched section', async () => {
    const budgetId = '01J00000000000000000000003';
    const itemId = '01J00000000000000000000004';
    const transactionId = '01J00000000000000000000005';
    const kindIds = {
      budget: budgetId,
      category: '01J00000000000000000000006',
      merchant: '01J00000000000000000000007',
    };
    f.request.mockImplementation(async (path: string) => ({
      items:
        path === '/finance/accounts'
          ? [
              {
                id: accountId,
                friendlyName: 'Checking',
                currency: 'USD',
                currencyExponent: 2,
                currentBalanceMinor: 100,
              },
            ]
          : [],
    }));
    f.preferences.mockImplementation(async (path: string) => {
      if (path === '/finance/dashboard-preferences')
        return {
          ...settings(),
          flags: Object.entries(kindIds).map(([targetKind, targetId]) => ({
            targetKind,
            targetId,
            included: true,
            version: 1,
          })),
        };
      if (path === '/finance/dashboard/budgets/' + budgetId)
        return {
          id: budgetId,
          name: 'Groceries',
          startDate: '2020-01-01',
          items: [{ id: itemId, currency: 'USD', currencyExponent: 2, plannedAmountMinor: -1000 }],
          accountIds: [accountId],
          complete: true,
        };
      if (path === '/finance/queries') return { queryId: transactionId };
      return {
        asOf: '2026-11-14T00:00:00Z',
        projectionRevision: 'r1',
        complete: true,
        rowsState: 'ready',
        aggregateState: 'exact',
        coverage: { examined: 1, scopeComplete: true },
        totalCount: 1,
        totalsByCurrency: [{ currency: 'USD', currencyExponent: 2, amountMinor: 1200 }],
        items: path.endsWith('/rows?limit=10')
          ? [
              {
                id: transactionId,
                description: 'Market',
                effectiveAt: '2026-11-14T00:00:00Z',
                amountMinor: -1200,
                currency: 'USD',
                currencyExponent: 2,
              },
            ]
          : [],
      };
    });
    const openBudget = vi.fn();
    const openTransaction = vi.fn();
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
        onOpenBudget={openBudget}
        onOpenTransaction={openTransaction}
      />,
    );
    const budgets = within(await view.findByRole('region', { name: 'Dashboard budgets' }));
    await budgets.findByText('Overspent');
    expect(budgets.getByText('120%')).toBeTruthy();
    expect(budgets.getByText('-$2.00')).toBeTruthy();
    fireEvent.click(budgets.getByRole('button', { name: 'Open budget' }));
    expect(openBudget).toHaveBeenCalledWith(budgetId);
    for (const kind of ['category', 'merchant']) {
      const activity = within(view.getByRole('region', { name: 'Recent ' + kind + ' activity' }));
      fireEvent.click(await activity.findByRole('link', { name: 'Market' }));
      expect(openTransaction).toHaveBeenLastCalledWith(
        transactionId,
        `dashboard-${kind}-${transactionId}`,
      );
    }
  });

  it('removes account names and balances immediately when Finance locks', async () => {
    f.request.mockImplementation(async (path: string) => ({
      items:
        path === '/finance/accounts'
          ? [
              {
                id: accountId,
                friendlyName: 'Private account',
                currency: 'USD',
                currencyExponent: 2,
                currentBalanceMinor: 999,
              },
            ]
          : [],
    }));
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={vi.fn()}
        onOpenBudget={vi.fn()}
        onOpenTransaction={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await view.findByRole('region', { name: 'Dashboard accounts' });
    act(() => {
      for (const listener of f.listeners) listener();
    });
    expect(view.queryByText('Private account')).toBeNull();
    expect(view.queryByText('$9.99')).toBeNull();
    expect(view.getByRole('region', { name: 'Dashboard accounts unavailable' })).toBeTruthy();
  });

  it('keeps upcoming expenses usable when account balances fail and saves the count', async () => {
    const expenses = Array.from({ length: 21 }, (_, index) => ({
      state: index === 0 ? 'overdue' : 'upcoming',
      expense: {
        id: `expense-${index}`,
        version: 1,
        dueDate: `2027-01-${String(index + 1).padStart(2, '0')}`,
        description: `Expense ${index}`,
        expectedAmountMinor: 100,
        currency: 'USD',
        currencyExponent: 2,
      },
      remainingAmountMinor: 100,
    }));
    f.request.mockImplementation(async (path: string) => {
      if (path === '/finance/accounts') throw new Error('unavailable');
      return { items: expenses };
    });
    f.preferences
      .mockResolvedValueOnce(settings(5, 2))
      .mockResolvedValueOnce({ upcomingCount: 10, version: 3 })
      .mockResolvedValue(settings(10, 3));
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={vi.fn()}
        onOpenBudget={vi.fn()}
        onOpenTransaction={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await view.findByRole('region', { name: 'Dashboard accounts unavailable' });
    const upcoming = within(view.getByRole('region', { name: 'Upcoming expenses' }));
    const count = await upcoming.findByRole<HTMLSelectElement>('combobox', {
      name: 'Number of upcoming expenses',
    });
    await upcoming.findByText(/^Expense 5 —/);
    expect(count.value).toBe('5');
    expect(upcoming.queryByText(/^Expense 6 —/)).toBeNull();
    expect(
      within(upcoming.getByRole('region', { name: 'Overdue' })).getByText(/^Expense 0 —/),
    ).toBeTruthy();
    fireEvent.change(count, { target: { value: '10' } });
    await upcoming.findByText('Dashboard preference saved.');
    expect(upcoming.getByText(/^Expense 10 —/)).toBeTruthy();
    expect(f.preferences).toHaveBeenNthCalledWith(
      2,
      '/finance/dashboard-preferences',
      expect.objectContaining({
        method: 'PATCH',
        csrfToken: 'csrf',
        body: JSON.stringify({ upcomingCount: 10, expectedVersion: 2 }),
      }),
    );
    view.unmount();
    const reopened = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={vi.fn()}
        onOpenBudget={vi.fn()}
        onOpenTransaction={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await reopened.findByText(/^Expense 10 —/);
    expect(
      reopened.getByRole<HTMLSelectElement>('combobox', { name: 'Number of upcoming expenses' })
        .value,
    ).toBe('10');
  });
  it('keeps flagged balances available when upcoming expenses fail', async () => {
    f.request.mockImplementation(async (path: string) => {
      if (path.startsWith('/finance/upcoming-expenses?timeZone=')) throw new Error('unavailable');
      return {
        items: [
          {
            id: accountId,
            friendlyName: 'Checking',
            currency: 'USD',
            currencyExponent: 2,
            currentBalanceMinor: 100,
          },
        ],
      };
    });
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        csrfToken="csrf"
        onOpenAccount={vi.fn()}
        onOpenBudget={vi.fn()}
        onOpenTransaction={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await view.findByText('Upcoming expenses are unavailable.');
    expect(
      within(await view.findByRole('region', { name: 'Dashboard accounts' })).getByText('Checking'),
    ).toBeTruthy();
    expect(view.getByText('Freshness unavailable')).toBeTruthy();
  });
});
