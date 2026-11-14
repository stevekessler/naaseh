// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  dispose: vi.fn(),
  onLock: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => ({ onLock: f.onLock }),
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
vi.mock('../../src/features/finance/accounts/FinanceAccountsPage.js', () => ({
  FinanceAccountsPage: () => null,
}));
vi.mock('../../src/features/finance/accounts/SimplefinConnectionPanel.js', () => ({
  SimplefinConnectionPanel: ({
    connection,
    onClaim,
    onRefresh,
  }: {
    connection?: { id: string; status: string; importStatus?: string };
    onClaim: (token: string) => Promise<void>;
    onRefresh?: () => Promise<void>;
  }) => (
    <div>
      <p>
        {connection
          ? `Canonical connection ${connection.id} ${connection.status} ${connection.importStatus ?? ''}`
          : 'No canonical connection'}
      </p>
      <button onClick={() => void onClaim('setup-token')}>Test claim</button>
      <button onClick={() => void onRefresh?.()}>Test refresh</button>
    </div>
  ),
}));
vi.mock('../../src/features/finance/transactions/FinanceTransactionsPage.js', () => ({
  FinanceTransactionsPage: () => null,
}));
vi.mock('../../src/features/finance/catalog/FinanceCategoryManager.js', () => ({
  FinanceCategoryManager: () => null,
}));
vi.mock('../../src/features/finance/catalog/FinanceMerchantPage.js', () => ({
  FinanceMerchantPage: () => null,
}));
vi.mock('../../src/features/finance/budgets/FinanceBudgetsPage.js', () => ({
  FinanceBudgetsPage: () => null,
}));

import { FinanceLandingPage } from '../../src/features/finance/FinanceLandingPage.js';

const connection = {
  id: 'canonical-connection',
  scope: { type: 'owner' as const, ownerId: 'owner' },
  provider: 'simplefin-bridge' as const,
  status: 'active' as const,
  version: 1,
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('SimpleFIN writes publish canonical reads', () => {
  it('does not present a failed canonical read as an unclaimed connection', async () => {
    f.request.mockRejectedValueOnce(new Error('offline'));
    const view = render(
      <FinanceLandingPage
        ownerId="owner"
        role="user"
        csrfToken="csrf"
        route={{ section: 'finance', view: 'accounts' }}
      />,
    );
    await view.findByText('Reconnect and refresh Finance before managing SimpleFIN.');
    expect(view.queryByRole('button', { name: 'Test claim' })).toBeNull();
    expect(view.queryByText('No canonical connection')).toBeNull();
  });

  it('ignores the claim response and renders only the protected connection read', async () => {
    f.request
      .mockResolvedValueOnce({ items: [] })
      .mockResolvedValueOnce({ id: connection.id, status: 'attention', secret: 'private reply' })
      .mockResolvedValueOnce({ items: [{ ...connection, importStatus: 'queued' }] });
    const view = render(
      <FinanceLandingPage
        ownerId="owner"
        role="user"
        csrfToken="csrf"
        route={{ section: 'finance', view: 'accounts' }}
      />,
    );
    await view.findByText('No canonical connection');
    fireEvent.click(view.getByRole('button', { name: 'Test claim' }));
    await view.findByText('Canonical connection canonical-connection active queued');
    expect(view.queryByText(/private reply|attention/u)).toBeNull();
    expect(f.request.mock.calls[1]![1]).toMatchObject({ method: 'POST' });
    expect(f.request.mock.calls[2]![0]).toBe('/finance/connections');
  });

  it('rechecks the retained version before refresh and ignores the job response', async () => {
    f.request
      .mockResolvedValueOnce({ items: [connection] })
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ items: [{ ...connection, importStatus: 'queued' }] });
    const view = render(
      <FinanceLandingPage
        ownerId="owner"
        role="user"
        csrfToken="csrf"
        route={{ section: 'finance', view: 'accounts' }}
      />,
    );
    await view.findByText('Canonical connection canonical-connection active');
    fireEvent.click(view.getByRole('button', { name: 'Test refresh' }));
    await view.findByText('Canonical connection canonical-connection active queued');
    expect(view.queryByText(/failed/u)).toBeNull();
    await waitFor(() => expect(f.request).toHaveBeenCalledTimes(3));
    expect(f.request.mock.calls[1]![0]).toBe(
      '/finance/connections/canonical-connection/refresh',
    );
  });
});
