// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DashboardFlagControl,
  DashboardFlagStatus,
  useDashboardFlags,
} from '../../src/features/finance/dashboard/DashboardFlagControl.js';

const f = vi.hoisted(() => {
  const locks = new Set<() => void>();
  const subscribers = new Set<() => void>();
  const access = {
    canRead: () => true,
    onLock: (callback: () => void) => {
      locks.add(callback);
      return () => locks.delete(callback);
    },
  };
  return {
    request: vi.fn(),
    access,
    current: access as typeof access | undefined,
    locks,
    subscribers,
  };
});
vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => f.current,
  subscribeFinanceAccess: (listener: () => void) => {
    f.subscribers.add(listener);
    return () => f.subscribers.delete(listener);
  },
}));

const targetId = '01J00000000000000000000001';
const base = '/finance/dashboard-preferences';
const flag = { targetKind: 'account', targetId, included: true, version: 1 };
const response = (flags: object[] = []) => ({ flags, settings: { upcomingCount: 10, version: 0 } });

function Controls() {
  const preferences = useDashboardFlags('csrf-token');
  return (
    <>
      <DashboardFlagStatus preferences={preferences} />
      <DashboardFlagControl
        preferences={preferences}
        kind="account"
        id={targetId}
        name="Checking"
      />
      <DashboardFlagControl preferences={preferences} kind="category" id={targetId} name="Food" />
    </>
  );
}
beforeEach(() => {
  f.request.mockReset();
  f.current = f.access;
});
afterEach(cleanup);

describe('Finance dashboard inclusion control', () => {
  it('shares one load and confirms the saved value with a new read', async () => {
    f.request
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce({ included: false })
      .mockResolvedValueOnce(response([flag]));
    const view = render(<Controls />);
    const account = view.getByRole<HTMLInputElement>('checkbox', { name: /Checking/ });
    const category = view.getByRole<HTMLInputElement>('checkbox', { name: /Food/ });
    expect(account.disabled).toBe(true);
    await waitFor(() => expect(account.disabled).toBe(false));
    expect(f.request).toHaveBeenCalledTimes(1);
    fireEvent.click(account);
    await view.findByText('Dashboard preference saved.');
    expect(account.checked).toBe(true);
    expect(category.checked).toBe(false);
    expect(f.request).toHaveBeenNthCalledWith(
      2,
      `${base}/account/${targetId}`,
      expect.objectContaining({
        method: 'PUT',
        csrfToken: 'csrf-token',
        idempotencyKey: expect.any(String),
        body: JSON.stringify({ included: true, expectedVersion: 0 }),
      }),
    );
  });

  it('displays a version conflict and replaces the old checkbox value', async () => {
    f.request
      .mockResolvedValueOnce(response([flag]))
      .mockRejectedValueOnce({ problem: { status: 409 } })
      .mockResolvedValueOnce(response([{ ...flag, included: false, version: 2 }]));
    const view = render(<Controls />);
    const account = view.getByRole<HTMLInputElement>('checkbox', { name: /Checking/ });
    await waitFor(() => expect(account.checked).toBe(true));
    fireEvent.click(account);
    await view.findByText(/The preference changed/);
    expect(account.checked).toBe(false);
    expect(f.request.mock.calls[1]?.[1]?.body).toEqual(
      JSON.stringify({ included: false, expectedVersion: 1 }),
    );
  });

  it('clears protected flag values on lock and ignores a late save response', async () => {
    let finish!: (value: object) => void;
    f.request.mockResolvedValueOnce(response([flag])).mockImplementationOnce(
      () =>
        new Promise<object>((resolve) => {
          finish = resolve;
        }),
    );
    const view = render(<Controls />);
    const account = view.getByRole<HTMLInputElement>('checkbox', { name: /Checking/ });
    await waitFor(() => expect(account.checked).toBe(true));
    fireEvent.click(account);
    await act(async () => {
      f.current = undefined;
      for (const lock of f.locks) lock();
      for (const listener of f.subscribers) listener();
      finish({});
    });
    expect(account.checked).toBe(false);
    expect(account.disabled).toBe(true);
    expect(view.queryByText('Dashboard preference saved.')).toBeNull();
    expect(f.request).toHaveBeenCalledTimes(2);
  });
});
