// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  queue: vi.fn(),
  queuePlan: vi.fn(),
  groups: vi.fn(),
  deny: false,
  listeners: new Set<() => void>(),
}));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  subscribeFinanceAccess: () => () => undefined,
  peekFinanceAccess: () => ({
    canRead: () => false,
    onLock: (listener: () => void) => {
      f.listeners.add(listener);
      return () => f.listeners.delete(listener);
    },
  }),
}));
vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/db/finance-repository.js', () => ({
  queueEncryptedBudgetCreationPlan: f.queuePlan,
  queueEncryptedBudgetMutation: f.queue,
}));
vi.mock('../../src/db/group-repository.js', () => ({ listLocalGroups: f.groups }));
vi.mock('../../src/sync/finance-api-snapshot.js', () => ({
  loadFinanceApiSnapshot: f.load,
  readFinanceApiSnapshot: f.read,
  disposeFinanceApiSnapshot: f.dispose,
}));
vi.mock('../../src/features/finance/budgets/FinanceBudgetDetail.js', () => ({
  FinanceBudgetDetail: () => <div>Private budget detail</div>,
}));
vi.mock('../../src/features/finance/budgets/ReusableItemsPage.js', () => ({
  ReusableItemsPage: () => <div>Private reusable items</div>,
}));
import { FinanceBudgetsPage } from '../../src/features/finance/budgets/FinanceBudgetsPage.js';
const budget = {
  id: 'budget',
  groupId: 'shared',
  name: 'Private monthly plan',
  startDate: '2026-11-01',
  endDate: null,
  totalsComplete: true,
  version: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  f.deny = false;
  f.listeners.clear();
  f.queue.mockResolvedValue(undefined);
  f.queuePlan.mockResolvedValue(undefined);
  f.groups.mockResolvedValue([
    {
      id: 'shared',
      name: 'Shared household',
      ownerId: 'owner',
      status: 'active',
      hasJoinPin: false,
      joined: true,
      role: 'member',
      version: 1,
    },
  ]);
  history.replaceState({}, '', '/finance/budgets');
  f.request.mockImplementation(async (path: string) =>
    path === '/finance/budgets'
      ? { items: [budget] }
      : path === '/finance/accounts'
        ? {
            items: [
              {
                id: 'account',
                friendlyName: 'Private account',
                currency: 'USD',
                scope: { type: 'group', groupId: 'shared' },
              },
            ],
          }
        : path === '/finance/categories'
          ? { items: [] }
          : budget,
  );
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }));
  f.read.mockImplementation(async (token, read: (value: unknown) => unknown) => {
    if (f.deny) throw new Error('Revoked');
    return read(token.value);
  });
});
afterEach(cleanup);
describe('retained budget snapshot boundary', () => {
  it('checks retained access before opening a budget and clears labels and drafts on lock', async () => {
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="owner" />);
    await view.findByRole('heading', { name: budget.name });
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Open budget' }));
    await view.findByText('Reconnect and refresh Finance to view budgets.');
    expect(view.queryByText(budget.name)).toBeNull();
    expect(view.queryByText('Private budget detail')).toBeNull();
    f.deny = false;
    fireEvent.click(view.getByRole('button', { name: 'Refresh budgets' }));
    await view.findByRole('heading', { name: budget.name });
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));
    fireEvent.change(view.getByLabelText('Budget name'), {
      target: { value: 'Unsaved private draft' },
    });
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await waitFor(() => expect(view.queryByText(budget.name)).toBeNull());
    expect(view.queryByDisplayValue('Unsaved private draft')).toBeNull();
    expect(view.queryByRole('dialog')).toBeNull();
    expect(f.dispose).toHaveBeenCalled();
  });
  it('disposes an old owner load instead of publishing it after an account switch', async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.load.mockReturnValueOnce(pending);
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="old" />);
    view.rerender(<FinanceBudgetsPage csrfToken="csrf" currentUserId="new" />);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    const stale = {
      value: { budgets: [{ ...budget, name: 'Old owner secret' }], accounts: [], categories: [] },
    };
    await act(async () => {
      finish(stale);
      await pending;
    });
    expect(view.queryByText('Old owner secret')).toBeNull();
    expect(f.dispose).toHaveBeenCalledWith(stale);
  });
  it('does not restore a late created budget or navigate after lock', async () => {
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="owner" />);
    await view.findByRole('heading', { name: budget.name });
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));
    fireEvent.change(view.getByLabelText('Budget name'), {
      target: { value: 'Late private budget' },
    });
    fireEvent.change(view.getByLabelText('Group'), { target: { value: 'shared' } });
    fireEvent.change(view.getByLabelText('Budget date'), { target: { value: '2026-11-09' } });
    fireEvent.change(view.getByLabelText('Start date'), { target: { value: '2026-11-09' } });
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.request.mockReturnValueOnce(pending);
    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        '/finance/budgets',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const loads = f.load.mock.calls.length;
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await act(async () => {
      finish({ ...budget, id: 'late', name: 'Late private budget' });
      await pending;
    });
    expect(view.queryByText('Private budget detail')).toBeNull();
    expect(view.queryByText('Late private budget')).toBeNull();
    expect(location.pathname).toBe('/finance/budgets');
    expect(f.load).toHaveBeenCalledTimes(loads);
  });
  it('does not link accounts after the retained budget source changes during creation', async () => {
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="owner" />);
    await view.findByRole('heading', { name: budget.name });
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));
    fireEvent.change(view.getByLabelText('Budget name'), {
      target: { value: 'Partly created budget' },
    });
    fireEvent.change(view.getByLabelText('Group'), { target: { value: 'shared' } });
    fireEvent.change(view.getByLabelText('Budget date'), { target: { value: '2026-11-09' } });
    fireEvent.change(view.getByLabelText('Start date'), { target: { value: '2026-11-09' } });
    fireEvent.click(view.getByLabelText('Private account'));
    f.request.mockImplementationOnce(async () => {
      f.deny = true;
      return { ...budget, id: 'created', name: 'Partly created budget' };
    });

    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);

    await view.findByText('Reconnect and refresh Finance to view budgets.');
    expect(
      f.request.mock.calls.some(([path]) => path === '/finance/budgets/created/accounts'),
    ).toBe(false);
    expect(location.pathname).toBe('/finance/budgets');
  });
  it('queues an unlinked budget securely with a stable local ID while offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="owner" />);
    await view.findByRole('heading', { name: budget.name });
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));
    fireEvent.change(view.getByLabelText('Budget name'), {
      target: { value: 'Offline household plan' },
    });
    fireEvent.change(view.getByLabelText('Group'), { target: { value: 'shared' } });
    fireEvent.change(view.getByLabelText('Budget date'), { target: { value: '2026-12-01' } });
    fireEvent.change(view.getByLabelText('Start date'), { target: { value: '2026-12-01' } });
    f.request.mockRejectedValueOnce(new TypeError('offline'));

    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);

    await view.findByRole('status');
    const queued = f.queue.mock.calls[0]![0];
    expect(queued).toMatchObject({
      entityId: expect.any(String),
      entityType: 'financeBudget',
      budgetId: expect.any(String),
      scopeKey: 'GROUP#shared',
      baseVersion: 0,
      value: {
        groupId: 'shared',
        name: 'Offline household plan',
        budgetDate: '2026-12-01',
        startDate: '2026-12-01',
        endDate: null,
        status: 'active',
        version: 1,
      },
    });
    expect(queued.entityId).toBe(queued.budgetId);
    expect(queued.value.id).toBe(queued.entityId);
    expect(view.queryByRole('dialog')).toBeNull();
  });
  it('queues selected account-link intent atomically instead of dropping it offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="owner" />);
    await view.findByRole('heading', { name: budget.name });
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));
    fireEvent.change(view.getByLabelText('Budget name'), { target: { value: 'Linked plan' } });
    fireEvent.change(view.getByLabelText('Group'), { target: { value: 'shared' } });
    fireEvent.change(view.getByLabelText('Budget date'), { target: { value: '2026-12-01' } });
    fireEvent.change(view.getByLabelText('Start date'), { target: { value: '2026-12-01' } });
    fireEvent.click(view.getByLabelText('Private account'));
    f.request.mockRejectedValueOnce(new TypeError('offline'));

    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);

    await view.findByRole('status');
    expect(f.queue).not.toHaveBeenCalled();
    expect(f.queuePlan).toHaveBeenCalledWith(
      expect.objectContaining({
        budgetId: expect.any(String),
        groupId: 'shared',
        scopeKey: 'GROUP#shared',
        accountIds: ['account'],
        value: expect.objectContaining({
          groupId: 'shared',
          name: 'Linked plan',
          status: 'active',
          version: 1,
        }),
      }),
    );
    expect(view.queryByRole('dialog')).toBeNull();
  });
});
