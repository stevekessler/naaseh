// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f = vi.hoisted(() => ({
  request: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
  values: new Map<object, unknown>(),
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
}));
import { FinanceMerchantDetail } from '../../src/features/finance/catalog/FinanceMerchantDetail.js';
const first = '01J00000000000000000000001',
  second = '01J00000000000000000000002';
const activity = (id: string) => ({
  merchant: {
    id,
    name: id === first ? 'Juniper market' : 'Maple shop',
    creatorId: 'owner',
    source: 'manual',
    status: 'active',
    version: 1,
  },
  transactions: [
    {
      id: `transaction-${id}`,
      description: id === first ? 'Private groceries' : 'Private supplies',
    },
  ],
  totalsComplete: true,
});
beforeEach(() => {
  vi.resetAllMocks();
  f.deny = false;
  f.listeners.clear();
  f.values.clear();
  f.request.mockImplementation(async (path: string) =>
    activity(path.endsWith(first) ? first : second),
  );
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => {
    const token = {};
    f.values.set(token, await load(f.request));
    return token;
  });
  f.read.mockImplementation(async (token, read: (value: unknown) => unknown) => {
    if (f.deny) throw new Error('Revoked');
    return read(f.values.get(token));
  });
});
afterEach(cleanup);
describe('retained merchant activity', () => {
  it('rechecks retained activity before previewing removal and clears it on lock even without a PIN', async () => {
    const view = render(
      <FinanceMerchantDetail
        merchantId={first}
        userId="owner"
        isAdmin={false}
        csrfToken="csrf"
        onRemoved={() => undefined}
      />,
    );
    await view.findByText('Private groceries');
    f.deny = true;
    fireEvent.click(view.getByRole('button', { name: 'Review merchant removal' }));
    await view.findByText('Reconnect and refresh Finance to view merchant activity.');
    expect(view.queryByText('Juniper market')).toBeNull();
    expect(view.queryByText('Private groceries')).toBeNull();
    expect(view.queryByText('No activity is available in your accessible accounts.')).toBeNull();
    expect(f.request).toHaveBeenCalledTimes(1);
    f.deny = false;
    fireEvent.click(view.getByRole('button', { name: 'Refresh merchant activity' }));
    await view.findByText('Private groceries');
    f.request.mockResolvedValueOnce({
      recordId: first,
      recordType: 'merchant',
      expectedVersion: 1,
      outcome: 'permanent-delete',
      confirmationToken: 'synthetic-token',
    });
    fireEvent.click(view.getByRole('button', { name: 'Review merchant removal' }));
    const confirm = await view.findByRole('button', { name: 'Remove mistaken merchant' });
    f.deny = true;
    fireEvent.click(confirm);
    await view.findByText('Reconnect and refresh Finance to view merchant activity.');
    expect(f.request).not.toHaveBeenCalledWith(
      `/finance/records/merchant/${first}/deletion`,
      expect.anything(),
    );
    f.deny = false;
    fireEvent.click(view.getByRole('button', { name: 'Refresh merchant activity' }));
    await view.findByText('Private groceries');
    let finishPreview!: (value: unknown) => void;
    const pendingPreview = new Promise((resolve) => {
      finishPreview = resolve;
    });
    f.request.mockReturnValueOnce(pendingPreview);
    fireEvent.click(view.getByRole('button', { name: 'Review merchant removal' }));
    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(`/finance/records/merchant/${first}/deletion-preview`),
    );
    act(() => {
      for (const listener of f.listeners) listener();
    });
    await waitFor(() => expect(view.queryByText('Private groceries')).toBeNull());
    expect(view.queryByText('Juniper market')).toBeNull();
    await act(async () => {
      finishPreview({
        recordId: first,
        recordType: 'merchant',
        expectedVersion: 1,
        outcome: 'permanent-delete',
        confirmationToken: 'synthetic-token',
      });
      await pendingPreview;
    });
    expect(view.queryByRole('button', { name: 'Remove mistaken merchant' })).toBeNull();
    view.unmount();
    expect(f.dispose).toHaveBeenCalled();
  });
  it('does not show a previous merchant while loading another or publish a late old response', async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const oldToken = {};
    f.load.mockImplementationOnce(async (load: (request: typeof f.request) => Promise<unknown>) => {
      f.values.set(oldToken, await load(f.request));
      await pending;
      return oldToken;
    });
    const props = {
      userId: 'owner',
      isAdmin: false,
      csrfToken: 'csrf',
      onRemoved: () => undefined,
    };
    const view = render(<FinanceMerchantDetail {...props} merchantId={first} />);
    await waitFor(() => expect(f.load).toHaveBeenCalledTimes(1));
    view.rerender(<FinanceMerchantDetail {...props} merchantId={second} />);
    await view.findByText('Private supplies');
    release();
    await act(async () => {
      await pending;
    });
    expect(view.queryByText('Private groceries')).toBeNull();
    expect(view.queryByText('Juniper market')).toBeNull();
    expect(f.dispose).toHaveBeenCalledWith(oldToken);
    view.unmount();
  });
});
