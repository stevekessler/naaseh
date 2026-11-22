// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FinanceNavigation } from '../../src/components/FinanceNavigation.js';
import {
  financeTransactionOrigin,
  navigate,
  parseAppRoute,
  routePath,
  type AppRoute,
  type FinanceModalBackground,
} from '../../src/app/router.js';

beforeEach(() => vi.stubGlobal('scrollTo', vi.fn()));

afterEach(() => {
  cleanup();
  history.replaceState({}, '', '/');
  vi.unstubAllGlobals();
});

describe('authoritative Finance navigation', () => {
  const routes: Array<[string, AppRoute]> = [
    ['/finance', { section: 'finance', view: 'dashboard' }],
    ['/finance/accounts', { section: 'finance', view: 'accounts' }],
    ['/finance/accounts/new', { section: 'finance', view: 'account-new' }],
    ['/finance/accounts/account%201', { section: 'finance', view: 'accounts', accountId: 'account 1' }],
    ['/finance/transactions', { section: 'finance', view: 'transactions' }],
    ['/finance/transactions/transaction%201', { section: 'finance', view: 'transactions', transactionId: 'transaction 1' }],
    ['/finance/upcoming-expenses', { section: 'finance', view: 'upcoming-expenses' }],
    ['/finance/upcoming-expenses/new', { section: 'finance', view: 'upcoming-expense-new' }],
    ['/finance/upcoming-expenses/expense%201', { section: 'finance', view: 'upcoming-expenses', upcomingExpenseId: 'expense 1' }],
    ['/finance/budgets', { section: 'finance', view: 'budgets' }],
    ['/finance/budgets/budget%201', { section: 'finance', view: 'budgets', budgetId: 'budget 1' }],
    ['/finance/categories', { section: 'finance', view: 'categories' }],
    ['/finance/merchants', { section: 'finance', view: 'merchants' }],
    ['/finance/merchants/merchant%201', { section: 'finance', view: 'merchants', merchantId: 'merchant 1' }],
    ['/finance/receipts', { section: 'finance', view: 'receipts' }],
    ['/finance/reports', { section: 'finance', view: 'reports' }],
    ['/finance/reports/spend', { section: 'finance', view: 'spend-report' }],
  ];

  it('parses and serializes every contracted destination with new before generic IDs', () => {
    for (const [path, route] of routes) {
      expect(parseAppRoute(path)).toEqual(route);
      expect(routePath(route)).toBe(path);
    }
    expect(parseAppRoute('/finance/accounts/new')).not.toHaveProperty('accountId');
    expect(parseAppRoute('/finance/upcoming-expenses/new')).not.toHaveProperty(
      'upcomingExpenseId',
    );
  });

  it('stores transaction modal background state without serializing it into the destination', () => {
    const background: FinanceModalBackground = {
      pathname: '/finance/transactions',
      search: '?account=account-1',
      scrollY: 240,
      focusId: 'transaction-row-1',
    };
    const changed = vi.fn();
    window.addEventListener('popstate', changed, { once: true });

    navigate(
      { section: 'finance', view: 'transactions', transactionId: 'transaction 1' },
      false,
      { financeBackground: background },
    );

    expect(location.pathname).toBe('/finance/transactions/transaction%201');
    expect(history.state).toEqual({ financeBackground: background });
    for (const [pathname, view] of [
      ['/finance', 'dashboard'],
      ['/finance/reports/spend', 'spend-report'],
    ]) {
      const financeBackground = { ...background, pathname };
      expect(financeTransactionOrigin({ financeBackground })).toEqual({
        background: financeBackground,
        route: { section: 'finance', view },
      });
    }
    expect(changed).toHaveBeenCalledOnce();
  });

  it('does not carry another app section\'s query state into Finance', () => {
    history.replaceState({}, '', '/tasks?match=all&scope=default');
    navigate({ section: 'finance', view: 'dashboard' });
    expect(`${location.pathname}${location.search}`).toBe('/finance');
  });

  it('opens Dashboard from Finance itself and preserves the contracted dropdown order', () => {
    const go = vi.fn();
    render(<FinanceNavigation active navigate={go} />);

    fireEvent.click(screen.getByRole('button', { name: 'Finance', exact: true }));
    expect(go).toHaveBeenCalledWith({ section: 'finance', view: 'dashboard' });

    fireEvent.click(screen.getByRole('button', { name: 'Show Finance menu' }));
    expect(
      screen.getByRole('group', { name: 'Finance destinations' }).querySelectorAll('button'),
    ).toHaveLength(10);
    expect(
      [...screen.getByRole('group', { name: 'Finance destinations' }).querySelectorAll('button')].map(
        (button) => button.textContent,
      ),
    ).toEqual([
      'Dashboard',
      'Accounts',
      'New Account',
      'Transactions',
      'Upcoming Expenses',
      'Budgets',
      'Categories',
      'Merchants',
      'Receipts',
      'Reports',
    ]);
  });
});
