// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  queue: vi.fn(),
  deny: false,
  listeners: new Set<() => void>(),
}));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => ({
    onLock: (listener: () => void) => {
      f.listeners.add(listener);
      return () => f.listeners.delete(listener);
    },
  }),
}));
vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/sync/finance-api-snapshot.js', () => ({
  loadFinanceApiSnapshot: f.load,
  readFinanceApiSnapshot: f.read,
  disposeFinanceApiSnapshot: f.dispose,
}));
vi.mock('../../src/db/finance-repository.js', () => ({
  queueEncryptedReusableItemMutation: f.queue,
}));
vi.mock('../../src/features/finance/budgets/TransactionMatches.js', () => ({
  TransactionMatches: () => <div>Match review child</div>,
}));
import { ReusableItemsPage } from '../../src/features/finance/budgets/ReusableItemsPage.js';
import type { BudgetDetailView } from '../../src/features/finance/budgets/FinanceBudgetDetail.js';
const item = {
  id: 'item',
  groupId: 'shared',
  description: 'Private water plan',
  financeCategoryId: 'category',
  plannedAmountMinor: -2500,
  currency: 'USD',
  currencyExponent: 2,
  relatedAccountIds: [],
  applicableDate: '2027-01-01',
  status: 'active',
  version: 1,
};
const budget = {
  id: 'budget',
  groupId: 'shared',
  name: 'Private budget',
  version: 2,
} as BudgetDetailView;
const offer = {
  reusableItemId: 'item',
  occurrenceDate: '2027-01-01',
  description: 'Private offer',
  plannedAmountMinor: -2500,
  currency: 'USD',
  currencyExponent: 2,
};
beforeEach(() => {
  vi.resetAllMocks();
  f.deny = false;
  f.listeners.clear();
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  f.request.mockImplementation(async (path: string) =>
    path === '/finance/reusable-items'
      ? { items: [item] }
      : path.endsWith('/reusable-offers')
        ? { items: [offer] }
        : path.endsWith('/deletion-preview')
          ? { outcome: 'archive', dependentCounts: { budgetItems: 1 } }
          : budget,
  );
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }));
  f.read.mockImplementation(async (token, operation: (value: unknown) => unknown) => {
    if (f.deny) throw new Error('Revoked');
    return operation(token.value);
  });
  f.queue.mockResolvedValue(undefined);
});
afterEach(cleanup);
const show = () =>
  render(
    <ReusableItemsPage
      budgets={[budget]}
      groups={[
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
      ]}
      accounts={[]}
      categories={[{ id: 'category', name: 'Private category' }]}
      csrfToken="csrf"
      onBack={() => undefined}
    />,
  );
const fill = async (view: ReturnType<typeof render>) => {
  fireEvent.click(view.getByRole('button', { name: 'Create reusable item' }));
  await view.findByRole('dialog', { name: 'Create reusable item' });
  fireEvent.change(view.getByLabelText('Reusable description'), {
    target: { value: 'New private plan' },
  });
  fireEvent.change(view.getByLabelText('Group'), { target: { value: 'shared' } });
  fireEvent.change(view.getByLabelText('Applicable date'), { target: { value: '2027-01-01' } });
  fireEvent.change(view.getByLabelText('Planned amount'), { target: { value: '25.00' } });
};
describe('retained reusable source boundary', () => {
  it('checks authority before an impact preview and clears private rows and selectors on denial', async () => {
    const view = show();
    await view.findByText(item.description);
    f.deny = true;
    const reads = f.request.mock.calls.length;
    fireEvent.click(view.getByRole('button', { name: 'Preview reusable item removal' }));
    await view.findByText('Refresh Finance to view reusable items.');
    expect(view.queryByText(item.description)).toBeNull();
    expect(view.queryByText('Private budget offers')).toBeNull();
    expect(view.queryByText('Match review child')).toBeNull();
    expect(f.request).toHaveBeenCalledTimes(reads);
  });
  it('discards offers that finish after lock and clears form and dependent views', async () => {
    const view = show();
    await view.findByText(item.description);
    await fill(view);
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.load.mockReturnValueOnce(pending);
    fireEvent.click(view.getByRole('button', { name: 'Private budget offers' }));
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    act(() => {
      for (const listener of f.listeners) listener();
    });
    const token = { value: { budget, offers: [offer] } };
    await act(async () => {
      finish(token);
      await pending;
    });
    expect(view.queryByText(offer.description)).toBeNull();
    expect(view.queryByDisplayValue('New private plan')).toBeNull();
    expect(view.queryByRole('dialog')).toBeNull();
    expect(view.queryByText('Match review child')).toBeNull();
    expect(f.dispose).toHaveBeenCalledWith(token);
  });
  it('does not reload or restore a create that finishes after lock', async () => {
    const view = show();
    await view.findByText(item.description);
    await fill(view);
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.request.mockReturnValueOnce(pending);
    fireEvent.click(view.getByRole('button', { name: 'Save reusable item' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        '/finance/reusable-items',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
    const loads = f.load.mock.calls.length;
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await act(async () => {
      finish({ ...item, description: 'Late private response' });
      await pending;
    });
    expect(view.queryByText('Late private response')).toBeNull();
    expect(view.queryByRole('dialog')).toBeNull();
    expect(f.load).toHaveBeenCalledTimes(loads);
    expect(f.queue).not.toHaveBeenCalled();
  });
  it('preserves a successful offline queue while blocking subsequent work after authority is revoked', async () => {
    const view = show();
    await view.findByText(item.description);
    await fill(view);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    f.request.mockRejectedValueOnce(new Error('Offline'));
    fireEvent.click(view.getByRole('button', { name: 'Save reusable item' }));
    await view.findByText('Reusable item queued securely and will sync when online.');
    expect(f.queue).toHaveBeenCalledOnce();
    expect(f.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        baseVersion: 0,
        scopeKey: 'GROUP#shared',
        value: expect.objectContaining({
          description: 'New private plan',
          applicableDate: '2027-01-01',
          version: 1,
        }),
      }),
    );
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Create reusable item' }));
    await view.findByText('Refresh Finance to view reusable items.');
    expect(view.queryByRole('dialog')).toBeNull();
    expect(f.queue).toHaveBeenCalledOnce();
    expect(view.queryByText('Reusable item queued securely and will sync when online.')).toBeNull();
  });
  it('keeps an offline mutation queued but suppresses stale success when authority changes during persistence', async () => {
    const view = show();
    await view.findByText(item.description);
    await fill(view);
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    f.request.mockRejectedValueOnce(new Error('Offline'));
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    f.queue.mockReturnValueOnce(pending);

    fireEvent.click(view.getByRole('button', { name: 'Save reusable item' }));
    await waitFor(() => expect(f.queue).toHaveBeenCalledOnce());
    f.deny = true;
    await act(async () => {
      finish();
      await pending;
    });

    expect(f.queue).toHaveBeenCalledOnce();
    expect(view.queryByText('Reusable item queued securely and will sync when online.')).toBeNull();
    await view.findByText('Refresh Finance to view reusable items.');
  });
});
