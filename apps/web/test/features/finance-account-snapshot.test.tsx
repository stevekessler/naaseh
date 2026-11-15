// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  value: undefined as unknown,
  token: {},
  deny: false,
  listeners: new Set<() => void>(),
}));
vi.mock('../../src/features/finance/security/finance-access.js', async (original) => ({
  ...(await original<object>()),
  peekFinanceAccess: () => ({
    canRead: () => false,
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
vi.mock('../../src/features/finance/accounts/FinanceAccountDetail.js', () => ({
  FinanceAccountDetail: ({
    removalImpact,
    onPreviewRemoval,
  }: {
    removalImpact?: { outcome: string };
    onPreviewRemoval: () => Promise<void>;
  }) => (
    <div>
      Private account details
      <button onClick={() => void onPreviewRemoval()}>Preview account removal</button>
      {removalImpact ? <p>{removalImpact.outcome}</p> : null}
    </div>
  ),
}));
import { FinanceAccountsPage } from '../../src/features/finance/accounts/FinanceAccountsPage.js';
const account = {
  id: '01J00000000000000000000001',
  friendlyName: 'Private checking',
  organizationName: 'Private bank',
  sourceName: 'Checking',
  currency: 'USD',
  currencyExponent: 2,
  currentBalanceMinor: 12345,
  balanceAt: '2026-11-08T00:00:00Z',
  status: 'active',
  version: 1,
};
beforeEach(() => {
  vi.resetAllMocks();
  f.deny = false;
  f.listeners.clear();
  f.request.mockResolvedValue({ items: [account] });
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => {
    f.value = await load(f.request);
    return f.token;
  });
  f.read.mockImplementation(async (_token, read: (value: unknown) => unknown) => {
    if (f.deny) throw new Error('Revoked');
    return read(f.value);
  });
});
afterEach(cleanup);
describe('retained account snapshot views', () => {
  it('rechecks before opening retained details and clears account labels/balances on lock even without a PIN', async () => {
    const view = render(<FinanceAccountsPage ownerId="owner" csrfToken="csrf" />);
    await view.findByRole('heading', { name: 'Private checking' });
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Open account' }));
    await view.findByText('Reconnect and refresh Finance to view accounts.');
    expect(view.queryByText('Private account details')).toBeNull();
    expect(view.queryByText('Private checking')).toBeNull();
    expect(view.queryByText('$123.45')).toBeNull();
    f.deny = false;
    fireEvent.click(view.getByRole('button', { name: 'Refresh accounts' }));
    await view.findByRole('heading', { name: 'Private checking' });
    fireEvent.click(view.getByRole('button', { name: 'Open account' }));
    await view.findByText('Private account details');
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await waitFor(() => expect(view.queryByText('Private checking')).toBeNull());
    expect(view.queryByText('Private account details')).toBeNull();
    view.unmount();
    expect(f.dispose).toHaveBeenCalledWith(f.token);
  });
  it('publishes verified account removal impact and clears it after revocation', async () => {
    const view = render(<FinanceAccountsPage ownerId="owner" csrfToken="csrf" />);
    await view.findByRole('heading', { name: 'Private checking' });
    fireEvent.click(view.getByRole('button', { name: 'Open account' }));
    await view.findByText('Private account details');
    const outcome = 'Private account impact';
    f.request.mockResolvedValueOnce({
      outcome,
      dependentCounts: { transactions: 1 },
      preservedRecordTypes: ['audit'],
    });
    fireEvent.click(view.getByRole('button', { name: 'Preview account removal' }));
    await view.findByText(outcome);
    expect(f.request).toHaveBeenCalledWith(
      `/finance/records/account/${account.id}/deletion-preview`,
    );
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Preview account removal' }));
    await view.findByText('Reconnect and refresh Finance to view accounts.');
    expect(view.queryByText(outcome)).toBeNull();
    expect(view.queryByText('Private account details')).toBeNull();
  });

  it('drops an account removal preview if the visit locks while it is loading', async () => {
    const view = render(<FinanceAccountsPage ownerId="owner" csrfToken="csrf" />);
    await view.findByRole('heading', { name: 'Private checking' });
    fireEvent.click(view.getByRole('button', { name: 'Open account' }));
    await view.findByText('Private account details');
    let finish!: (value: unknown) => void;
    const response = new Promise((resolve) => {
      finish = resolve;
    });
    const outcome = 'Late private account impact';
    f.request.mockReturnValueOnce(response);
    fireEvent.click(view.getByRole('button', { name: 'Preview account removal' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        `/finance/records/account/${account.id}/deletion-preview`,
      ),
    );
    act(() => {
      for (const listener of f.listeners) listener();
    });
    const readCalls = f.read.mock.calls.length;
    const disposeCalls = f.dispose.mock.calls.length;
    await act(async () => {
      finish({ outcome, dependentCounts: {}, preservedRecordTypes: [] });
      await response;
    });
    expect(f.read).toHaveBeenCalledTimes(readCalls);
    expect(f.dispose).toHaveBeenCalledTimes(disposeCalls + 1);
    expect(view.queryByText(outcome)).toBeNull();
  });

  it('does not publish an old owner snapshot after an account switch while the load is pending', async () => {
    const oldToken = {};
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    f.load.mockImplementationOnce(async () => {
      await pending;
      return oldToken;
    });
    const view = render(<FinanceAccountsPage ownerId="old-owner" csrfToken="csrf" />);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(1));
    f.request.mockResolvedValue({ items: [] });
    view.rerender(<FinanceAccountsPage ownerId="new-owner" csrfToken="new-csrf" />);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    release();
    await act(async () => {
      await pending;
    });
    expect(view.queryByText('Private checking')).toBeNull();
    expect(f.dispose).toHaveBeenCalledWith(oldToken);
  });
});
