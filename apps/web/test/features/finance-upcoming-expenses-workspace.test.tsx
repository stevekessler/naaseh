// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createUpcomingExpense } from '@naaseh/domain';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  financeRequest: vi.fn(),
  queueExpense: vi.fn(),
  dispose: vi.fn(),
  listeners: new Set<() => void>(),
}));

vi.mock('../../src/features/finance/finance-client.js', () => ({
  financeRequest: f.financeRequest,
}));
vi.mock('../../src/db/finance-repository.js', () => ({
  queueEncryptedUpcomingExpenseMutation: f.queueExpense,
}));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => ({
    onLock: (listener: () => void) => {
      f.listeners.add(listener);
      return () => f.listeners.delete(listener);
    },
  }),
}));
vi.mock('../../src/db/group-repository.js', () => ({
  listLocalGroups: async () => [
    { id: '01K00000000000000000000001', name: 'Household', status: 'active', joined: true },
    { id: '01K00000000000000000000009', name: 'Former group', status: 'inactive', joined: false },
  ],
}));
vi.mock('../../src/sync/finance-api-snapshot.js', () => ({
  loadFinanceApiSnapshot: async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }),
  readFinanceApiSnapshot: async (snapshot: { value: unknown }, read: (value: unknown) => unknown) =>
    read(snapshot.value),
  disposeFinanceApiSnapshot: f.dispose,
}));

import { UpcomingExpensesWorkspace } from '../../src/features/finance/upcoming/UpcomingExpensesWorkspace.js';

const expenseView = {
  expense: createUpcomingExpense({
    id: '01K00000000000000000000990',
    groupId: '01K00000000000000000000001',
    accountId: '01K00000000000000000000002',
    budgetId: '01K00000000000000000000003',
    description: 'Winter utilities',
    expectedAmountMinor: 7_500,
    currency: 'USD',
    dueDate: '2027-01-15',
    entryContext: {
      enteredAt: '2026-11-14T18:00:00.000Z',
      localDate: '2026-11-14',
      timeZone: 'America/Denver',
    },
    creatorId: 'owner',
    acceptedAt: '2026-11-14T18:00:01.000Z',
  }),
  fulfillments: [],
  claimVersions: {},
  fulfilledAmountMinor: 0,
  remainingAmountMinor: 7_500,
  overpaidAmountMinor: 0,
  state: 'upcoming' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  f.listeners.clear();
  f.financeRequest.mockResolvedValue({});
  f.queueExpense.mockResolvedValue({});
  f.request.mockImplementation(async (path: string) => {
    if (path.startsWith('/finance/upcoming-expenses/')) return expenseView;
    if (path.startsWith('/finance/upcoming-expenses')) return { items: [expenseView] };
    if (path === '/finance/accounts')
      return {
        items: [
          {
            id: expenseView.expense.accountId,
            friendlyName: 'Checking',
            currency: 'USD',
            scope: { type: 'owner', ownerId: 'owner' },
          },
        ],
      };
    if (path === '/finance/budgets')
      return {
        items: [
          {
            id: expenseView.expense.budgetId,
            groupId: expenseView.expense.groupId,
            name: 'Household plan',
            status: 'active',
            activity: 'active',
          },
        ],
      };
    if (path.endsWith('/transactions')) return { items: [] };
    throw new Error(`Unexpected request: ${path}`);
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('upcoming expense protected workspace', () => {
  it('rechecks the protected snapshot and canonically reloads after rescheduling', async () => {
    const rendered = render(
      <UpcomingExpensesWorkspace
        ownerId="owner"
        csrfToken="csrf"
        initialExpenseId={expenseView.expense.id}
        onCreate={vi.fn()}
        onOpenExpense={vi.fn()}
        onOpenAccount={vi.fn()}
      />,
    );
    await rendered.findByRole('heading', { name: 'Winter utilities' });

    fireEvent.change(rendered.getByLabelText('New date'), { target: { value: '2027-02-01' } });
    fireEvent.click(rendered.getByRole('button', { name: 'Save new date' }));

    await rendered.findByText('Upcoming expense saved.');
    expect(f.financeRequest).toHaveBeenCalledWith(
      `/finance/upcoming-expenses/${expenseView.expense.id}`,
      expect.objectContaining({ method: 'PATCH', csrfToken: 'csrf' }),
    );
    expect(
      f.request.mock.calls.filter(
        ([path]) => path === `/finance/upcoming-expenses/${expenseView.expense.id}`,
      ),
    ).toHaveLength(2);
  });

  it('clears expense data immediately when Finance access locks', async () => {
    const rendered = render(
      <UpcomingExpensesWorkspace
        ownerId="owner"
        csrfToken="csrf"
        initialExpenseId={expenseView.expense.id}
        onCreate={vi.fn()}
        onOpenExpense={vi.fn()}
        onOpenAccount={vi.fn()}
      />,
    );
    await rendered.findByRole('heading', { name: 'Winter utilities' });
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await waitFor(() => expect(rendered.queryByText('Winter utilities')).toBeNull());
    expect(rendered.getByRole('alert').textContent).toMatch(/Reconnect and refresh Finance/u);
  });

  it('queues an offline create with its original local entry context', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    f.financeRequest.mockRejectedValue(new TypeError('offline'));
    const rendered = render(
      <UpcomingExpensesWorkspace
        ownerId="owner"
        csrfToken="csrf"
        creating
        onCreate={vi.fn()}
        onOpenExpense={vi.fn()}
        onOpenAccount={vi.fn()}
      />,
    );
    await rendered.findByRole('heading', { name: 'New upcoming expense' });
    fireEvent.change(rendered.getByLabelText('Description'), {
      target: { value: 'Offline renewal' },
    });
    fireEvent.change(rendered.getByLabelText('Expected amount'), { target: { value: '45.00' } });
    fireEvent.change(rendered.getByLabelText('Date'), { target: { value: '2027-01-20' } });
    fireEvent.change(rendered.getByLabelText('Group'), {
      target: { value: expenseView.expense.groupId },
    });
    fireEvent.change(rendered.getByLabelText('Budget'), {
      target: { value: expenseView.expense.budgetId },
    });
    fireEvent.change(rendered.getByLabelText('Account'), {
      target: { value: expenseView.expense.accountId },
    });
    fireEvent.click(rendered.getByRole('button', { name: 'Save upcoming expense' }));

    await rendered.findByText('Upcoming expense queued securely and will sync when online.');
    expect(f.queueExpense).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 0,
        scopeKey: 'OWNER#owner',
        expense: expect.objectContaining({
          description: 'Offline renewal',
          dueDate: '2027-01-20',
          entryContext: expect.objectContaining({ timeZone: expect.any(String) }),
        }),
        payloadValue: expect.objectContaining({
          description: 'Offline renewal',
          dueDate: '2027-01-20',
          entryContext: expect.objectContaining({ timeZone: expect.any(String) }),
        }),
      }),
    );
  });
});
