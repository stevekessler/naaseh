// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  combine: vi.fn(),
  values: new Map<object, unknown>(),
  value: undefined as unknown,
  token: {},
  deny: false,
  listeners: new Set<() => void>(),
}));
vi.mock('../../src/features/finance/security/finance-access.js', async (original) => ({
  ...(await original<object>()),
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
  combineFinanceApiSnapshots: f.combine,
}));
vi.mock('../../src/features/finance/transactions/TransactionDetail.js', () => ({
  TransactionDetail: ({
    removalImpact,
    onPreviewRemoval,
    onChange,
  }: {
    removalImpact?: { outcome: string };
    onPreviewRemoval: () => Promise<void>;
    onChange: () => Promise<boolean>;
  }) => (
    <div>
      Private transaction details
      <button onClick={() => void onPreviewRemoval()}>Preview transaction removal</button>
      {removalImpact ? <p>{removalImpact.outcome}</p> : null}
      <button onClick={() => void onChange()}>Save fixture transaction</button>
    </div>
  ),
}));
import { FinanceTransactionsPage } from '../../src/features/finance/transactions/FinanceTransactionsPage.js';
const accountId = '01J00000000000000000000001',
  transactionId = '01J00000000000000000000002';
beforeEach(() => {
  vi.resetAllMocks();
  f.deny = false;
  f.listeners.clear();
  f.values.clear();
  f.request.mockImplementation(async (path: string) => ({
    items:
      path === '/finance/accounts'
        ? [{ id: accountId, friendlyName: 'Checking' }]
        : path.endsWith('/transactions')
          ? [
              {
                id: transactionId,
                accountId,
                description: 'Juniper groceries',
                amountMinor: -1000,
                currency: 'USD',
                currencyExponent: 2,
                version: 1,
                allocations: [],
                reviewState: 'none',
                reconciliationState: 'unreconciled',
              },
            ]
          : [],
  }));
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => {
    f.value = await load(f.request);
    f.token = {};
    f.values.set(f.token, f.value);
    return f.token;
  });
  f.read.mockImplementation(async (_token, read: (value: unknown) => unknown) => {
    if (f.deny) throw new Error('Revoked');
    return read(f.values.get(_token));
  });
  f.combine.mockImplementation(async (first, second, combine) => {
    const token = {};
    f.value = await combine(f.values.get(first), f.values.get(second));
    f.values.set(token, f.value);
    f.token = token;
    return token;
  });
});
afterEach(cleanup);
describe('retained transaction snapshot views', () => {
  it('publishes a freshly verified graph after a mutation and clears it after revocation', async () => {
    const view = render(<FinanceTransactionsPage csrfToken="csrf" />);
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    fireEvent.click(view.getByRole('button', { name: 'Review Juniper groceries' }));
    await view.findByText('Private transaction details');
    const originalRequest = f.request.getMockImplementation()!;
    f.request.mockImplementation(async (path: string) => {
      if (path !== `/finance/transactions/${transactionId}`) return originalRequest(path);
      const result = await originalRequest(`/finance/accounts/${accountId}/transactions`);
      return { ...result.items[0], description: 'Verified fresh groceries' };
    });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.load.mockImplementationOnce(async (load: (request: typeof f.request) => Promise<unknown>) => {
      await pending;
      f.value = await load(f.request);
      f.token = {};
      f.values.set(f.token, f.value);
      return f.token;
    });
    fireEvent.click(view.getByRole('button', { name: 'Save fixture transaction' }));
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    expect(view.queryByText('Verified fresh groceries')).toBeNull();
    release();
    await view.findByRole('article', { name: 'Verified fresh groceries transaction' });
    expect(f.request).toHaveBeenCalledWith(`/finance/transactions/${transactionId}`);
    expect(
      f.request.mock.calls.filter(
        ([path]) => path === `/finance/accounts/${accountId}/transactions`,
      ),
    ).toHaveLength(1);
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Save fixture transaction' }));
    await view.findByText('Reconnect and refresh Finance to search transactions.');
    expect(
      view.queryByRole('article', { name: 'Verified fresh groceries transaction' }),
    ).toBeNull();
    expect(view.queryByText('0 transactions found')).toBeNull();
  });
  it('shows a removal impact only after verification and clears it on lock', async () => {
    const view = render(<FinanceTransactionsPage csrfToken="csrf" />);
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    fireEvent.click(view.getByRole('button', { name: 'Review Juniper groceries' }));
    await view.findByText('Private transaction details');

    let finish!: () => void;
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const outcome = 'Private removal impact';
    f.request.mockImplementationOnce(async () => {
      await response;
      return { outcome, preservedRecordTypes: ['audit'] };
    });
    fireEvent.click(view.getByRole('button', { name: 'Preview transaction removal' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        `/finance/records/transaction/${transactionId}/deletion-preview`,
      ),
    );
    expect(view.queryByText(outcome)).toBeNull();
    finish();
    await view.findByText(outcome);
    expect(f.read.mock.calls.some(([token]) => token === f.token)).toBe(true);
    expect(f.dispose.mock.calls.some(([token]) => token === f.token)).toBe(true);
    act(() => {
      for (const listener of f.listeners) listener();
    });
    expect(view.queryByText(outcome)).toBeNull();
    expect(view.queryByText('Private transaction details')).toBeNull();
  });

  it('discards a removal impact response when lock occurs before it resolves', async () => {
    const view = render(<FinanceTransactionsPage csrfToken="csrf" />);
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    fireEvent.click(view.getByRole('button', { name: 'Review Juniper groceries' }));
    await view.findByText('Private transaction details');

    let finish!: () => void;
    const response = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const outcome = 'Late private removal impact';
    f.request.mockImplementationOnce(async () => {
      await response;
      return { outcome, preservedRecordTypes: ['audit'] };
    });
    fireEvent.click(view.getByRole('button', { name: 'Preview transaction removal' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        `/finance/records/transaction/${transactionId}/deletion-preview`,
      ),
    );
    const prior = f.token;
    act(() => {
      for (const listener of f.listeners) listener();
    });
    finish();
    await waitFor(() => {
      expect(f.token).not.toBe(prior);
      expect(f.dispose.mock.calls.some(([token]) => token === f.token)).toBe(true);
    });
    expect(f.read.mock.calls.some(([token]) => token === f.token)).toBe(false);
    expect(view.queryByText(outcome)).toBeNull();
  });

  it('withholds a reused index while checking and does not label revoked data an empty result', async () => {
    const view = render(<FinanceTransactionsPage csrfToken="csrf" />);
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    let release!: () => void,
      started = false;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.read.mockImplementationOnce(async (_token, read: (value: unknown) => unknown) => {
      started = true;
      await pending;
      return read(f.value);
    });
    fireEvent.change(view.getByLabelText('Search transactions'), { target: { value: 'Juniper' } });
    await waitFor(() => expect(started).toBe(true));
    expect(view.queryByRole('article', { name: 'Juniper groceries transaction' })).toBeNull();
    expect(view.getByText('Checking transactions…')).toBeTruthy();
    release();
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    f.deny = true;
    fireEvent.change(view.getByLabelText('Search transactions'), {
      target: { value: 'groceries' },
    });
    await view.findByText('Reconnect and refresh Finance to search transactions.');
    expect(view.queryByRole('article', { name: 'Juniper groceries transaction' })).toBeNull();
    expect(view.queryByText('0 transactions found')).toBeNull();
    expect(view.queryByRole('option', { name: 'Checking' })).toBeNull();
  });
  it('ignores a late query, rechecks before opening retained details and disposes memory on unmount', async () => {
    const view = render(<FinanceTransactionsPage csrfToken="csrf" />);
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await waitFor(() =>
      expect(view.queryByRole('article', { name: 'Juniper groceries transaction' })).toBeNull(),
    );
    expect(view.queryByRole('option', { name: 'Checking' })).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Refresh transactions' }));
    await view.findByRole('article', { name: 'Juniper groceries transaction' });

    let release!: () => void,
      started = false;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.read.mockImplementationOnce(async (_token, read: (value: unknown) => unknown) => {
      started = true;
      await pending;
      return read(f.value);
    });
    fireEvent.change(view.getByLabelText('Search transactions'), { target: { value: 'no-match' } });
    await waitFor(() => expect(started).toBe(true));
    fireEvent.change(view.getByLabelText('Search transactions'), { target: { value: 'Juniper' } });
    await view.findByRole('article', { name: 'Juniper groceries transaction' });
    release();
    await Promise.resolve();
    expect(view.getByRole('article', { name: 'Juniper groceries transaction' })).toBeTruthy();
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Review Juniper groceries' }));
    await view.findByText('Reconnect and refresh Finance to search transactions.');
    expect(view.queryByText('Private transaction details')).toBeNull();
    view.unmount();
    expect(f.dispose).toHaveBeenCalledWith(f.token);
  });
});
