// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  deny: false,
  listeners: new Set<() => void>(),
  status: 'suggested',
  version: 1,
  transactionVersion: 3,
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
import { TransactionMatches } from '../../src/features/finance/budgets/TransactionMatches.js';
const match = () => ({
  id: 'match',
  transactionId: 'transaction',
  budgetItemId: 'item',
  kind: 'near',
  scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 10 },
  status: f.status,
  version: f.version,
});
beforeEach(() => {
  vi.resetAllMocks();
  f.deny = false;
  f.status = 'suggested';
  f.version = 1;
  f.transactionVersion = 3;
  f.listeners.clear();
  f.request.mockImplementation(async (path: string, options?: { method: string; body: string }) => {
    if (options?.method === 'POST') {
      f.status = 'accepted';
      f.version = 2;
      f.transactionVersion = 4;
      return { ...match(), status: 'rejected', version: 999 };
    }
    if (path.endsWith('/deletion-preview')) return { outcome: 'tombstone' };
    return { items: [match()], transactionVersion: f.transactionVersion };
  });
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }));
  f.read.mockImplementation(async (token, operation: (value: unknown) => unknown) => {
    if (f.deny) throw new Error('Revoked');
    return operation(token.value);
  });
});
afterEach(cleanup);
const open = async (view: ReturnType<typeof render>) => {
  fireEvent.change(view.getByLabelText('Transaction for match review'), {
    target: { value: 'transaction' },
  });
  fireEvent.click(view.getByRole('button', { name: 'Review matches' }));
  await view.findByRole('article', { name: 'Near match suggestion' });
};
describe('retained Finance match authorization', () => {
  it('reloads canonical match/transaction versions after a decision and blocks a revoked next action', async () => {
    const view = render(<TransactionMatches csrfToken="csrf" />);
    await open(view);
    fireEvent.click(view.getByRole('button', { name: 'Accept match' }));
    await view.findByRole('button', { name: 'Undo match' });
    expect(view.queryByText('Status: rejected')).toBeNull();
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(2));
    fireEvent.click(view.getByRole('button', { name: 'Undo match' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        '/finance/matches/match/decision',
        expect.objectContaining({
          body: JSON.stringify({
            decision: 'undo',
            expectedVersion: 2,
            expectedTransactionVersion: 4,
          }),
        }),
      ),
    );
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(3));
    f.deny = true;
    const writes = f.request.mock.calls.filter(([, options]) => options?.method === 'POST').length;
    fireEvent.click(view.getByRole('button', { name: 'Undo match' }));
    await view.findByText('Refresh Finance before reviewing matches.');
    expect(view.queryByRole('article')).toBeNull();
    expect(f.request.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(
      writes,
    );
  });
  it('clears retained matches on transaction change and discards a late superseded load', async () => {
    const view = render(<TransactionMatches csrfToken="csrf" />);
    await open(view);
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.load.mockReturnValueOnce(pending);
    fireEvent.change(view.getByLabelText('Transaction for match review'), {
      target: { value: 'old' },
    });
    expect(view.queryByRole('article')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Review matches' }));
    fireEvent.change(view.getByLabelText('Transaction for match review'), {
      target: { value: 'new' },
    });
    const token = { value: { items: [match()], transactionVersion: 3 } };
    await act(async () => {
      finish(token);
      await pending;
    });
    expect(view.queryByRole('article')).toBeNull();
    expect(f.dispose).toHaveBeenCalledWith(token);
    expect((view.getByLabelText('Transaction for match review') as HTMLInputElement).value).toBe(
      'new',
    );
  });
  it('does not reload or republish a decision that completes after lock', async () => {
    const view = render(<TransactionMatches csrfToken="csrf" />);
    await open(view);
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.request.mockReturnValueOnce(pending);
    fireEvent.click(view.getByRole('button', { name: 'Accept match' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith('/finance/matches/match/decision', expect.anything()),
    );
    const loads = f.load.mock.calls.length;
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await act(async () => {
      finish(match());
      await pending;
    });
    expect(view.queryByRole('article')).toBeNull();
    expect((view.getByLabelText('Transaction for match review') as HTMLInputElement).value).toBe(
      '',
    );
    expect(f.load).toHaveBeenCalledTimes(loads);
  });
  it('keeps removal previews inside verified snapshots and discards a preview completing after lock', async () => {
    const view = render(<TransactionMatches csrfToken="csrf" />);
    await open(view);
    fireEvent.click(view.getByRole('button', { name: 'Preview match removal' }));
    await view.findByText('Removing this match will preserve an audit tombstone.');
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    f.load.mockReturnValueOnce(pending);
    fireEvent.click(view.getByRole('button', { name: 'Preview match removal' }));
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(3));
    act(() => {
      for (const listener of f.listeners) listener();
    });
    const token = { value: { outcome: 'private-impact' } };
    await act(async () => {
      finish(token);
      await pending;
    });
    expect(view.queryByText(/Removing this match/)).toBeNull();
    expect(view.queryByText(/private-impact/)).toBeNull();
    expect(f.dispose).toHaveBeenCalledWith(token);
  });
});
