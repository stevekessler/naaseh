// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  dispose: vi.fn(),
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
vi.mock('../../src/sync/finance-api-snapshot.js', () => ({
  loadFinanceApiSnapshot: async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }),
  readFinanceApiSnapshot: async (snapshot: { value: unknown }, read: (value: unknown) => unknown) =>
    read(snapshot.value),
  disposeFinanceApiSnapshot: f.dispose,
}));

import { FinanceDashboardPage } from '../../src/features/finance/dashboard/FinanceDashboardPage.js';

beforeEach(() => {
  vi.clearAllMocks();
  f.listeners.clear();
});
afterEach(cleanup);

describe('protected Finance dashboard', () => {
  it('shows a truthful confirmed empty state without fabricated balances', async () => {
    f.request.mockResolvedValue({ items: [] });
    const view = render(
      <FinanceDashboardPage
        ownerId="owner"
        onOpenAccount={vi.fn()}
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
                id: 'account-1',
                friendlyName: 'Household checking',
                currency: 'USD',
                currencyExponent: 2,
                currentBalanceMinor: 12345,
                freshness: { lastUpdatedAt: '2026-11-13T12:00:00.000Z', stale: true },
              },
            ]
          : [],
    }));
    const open = vi.fn();
    const view = render(
      <FinanceDashboardPage ownerId="owner" onOpenAccount={open} onOpenUpcomingExpense={vi.fn()} />,
    );
    await view.findByText('Household checking');
    expect(view.getByText('$123.45')).toBeTruthy();
    expect(view.getByText('Refresh recommended')).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Open account' }));
    expect(open).toHaveBeenCalledWith('account-1');
  });

  it('removes account names and balances immediately when Finance locks', async () => {
    f.request.mockImplementation(async (path: string) => ({
      items:
        path === '/finance/accounts'
          ? [
              {
                id: 'account-1',
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
        onOpenAccount={vi.fn()}
        onOpenUpcomingExpense={vi.fn()}
      />,
    );
    await view.findByText('Private account');
    act(() => {
      for (const listener of f.listeners) listener();
    });
    expect(view.queryByText('Private account')).toBeNull();
    expect(view.queryByText('$9.99')).toBeNull();
    expect(view.getByRole('region', { name: 'Finance dashboard unavailable' })).toBeTruthy();
  });
});
