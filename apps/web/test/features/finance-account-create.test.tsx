// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  dispose: vi.fn(),
  listeners: new Set<() => void>(),
}));

vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
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
  readFinanceApiSnapshot: async (
    snapshot: { value: unknown },
    read: (value: unknown) => unknown,
  ) => read(snapshot.value),
  disposeFinanceApiSnapshot: f.dispose,
}));

import { FinanceAccountCreatePage } from '../../src/features/finance/accounts/FinanceAccountCreatePage.js';

beforeEach(() => {
  vi.clearAllMocks();
  f.listeners.clear();
});
afterEach(cleanup);

describe('dedicated financial-account creation', () => {
  it('reports field-specific errors and retains valid incomplete input', () => {
    const view = render(
      <FinanceAccountCreatePage ownerId="owner" csrfToken="csrf" onCreated={vi.fn()} />,
    );
    fireEvent.change(view.getByLabelText('Organization name'), {
      target: { value: 'Fixture Bank' },
    });
    fireEvent.change(view.getByLabelText('Opening balance'), { target: { value: '1,000' } });
    fireEvent.click(view.getByRole('button', { name: 'Add account' }));

    expect(view.getByText('Enter an account name.')).toBeTruthy();
    expect(view.getByText(/at most 2 decimal places/u)).toBeTruthy();
    expect((view.getByLabelText('Organization name') as HTMLInputElement).value).toBe(
      'Fixture Bank',
    );
    expect(f.request).not.toHaveBeenCalled();
  });

  it('retains all entries when the canonical saved account cannot be confirmed', async () => {
    f.request
      .mockResolvedValueOnce({ id: 'account-1', version: 1 })
      .mockRejectedValueOnce(new Error('read unavailable'));
    const view = render(
      <FinanceAccountCreatePage ownerId="owner" csrfToken="csrf" onCreated={vi.fn()} />,
    );
    fireEvent.change(view.getByLabelText('Organization name'), {
      target: { value: 'Fixture Bank' },
    });
    fireEvent.change(view.getByLabelText('Account name'), { target: { value: 'Checking' } });
    fireEvent.change(view.getByLabelText('Opening balance'), { target: { value: '12.34' } });
    fireEvent.click(view.getByRole('button', { name: 'Add account' }));

    await view.findByText(/could not be confirmed/u);
    expect((view.getByLabelText('Account name') as HTMLInputElement).value).toBe('Checking');
    expect((view.getByLabelText('Opening balance') as HTMLInputElement).value).toBe('12.34');
  });

  it('navigates only after a protected canonical read confirms the saved version', async () => {
    f.request
      .mockResolvedValueOnce({ id: 'account-1', version: 2 })
      .mockResolvedValueOnce({ items: [{ id: 'account-1', version: 2 }] });
    const created = vi.fn();
    const view = render(
      <FinanceAccountCreatePage ownerId="owner" csrfToken="csrf" onCreated={created} />,
    );
    fireEvent.change(view.getByLabelText('Organization name'), {
      target: { value: 'Fixture Bank' },
    });
    fireEvent.change(view.getByLabelText('Account name'), { target: { value: 'Checking' } });
    fireEvent.click(view.getByRole('button', { name: 'Add account' }));

    await waitFor(() => expect(created).toHaveBeenCalledWith('account-1'));
    expect(f.request.mock.calls[0]![1]).toMatchObject({ method: 'POST' });
    expect(f.request.mock.calls[1]![0]).toBe('/finance/accounts');
    expect(f.dispose).toHaveBeenCalledOnce();
  });

  it('clears protected pending account names when Finance locks', () => {
    const view = render(
      <FinanceAccountCreatePage ownerId="owner" csrfToken="csrf" onCreated={vi.fn()} />,
    );
    fireEvent.change(view.getByLabelText('Organization name'), {
      target: { value: 'Private bank' },
    });
    fireEvent.change(view.getByLabelText('Account name'), { target: { value: 'Private account' } });
    act(() => {
      for (const listener of f.listeners) listener();
    });
    expect((view.getByLabelText('Organization name') as HTMLInputElement).value).toBe('');
    expect((view.getByLabelText('Account name') as HTMLInputElement).value).toBe('');
    expect(view.getByText(/Reconnect and refresh Finance/u)).toBeTruthy();
  });
});
