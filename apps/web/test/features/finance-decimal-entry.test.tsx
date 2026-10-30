import { FinanceLandingPage } from '../../src/features/finance/FinanceLandingPage.js';
import { FinanceBudgetDetail } from '../../src/features/finance/budgets/FinanceBudgetDetail.js';
// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinanceAccountsPage } from '../../src/features/finance/accounts/FinanceAccountsPage.js';
import { DuplicateReview, chunkReviewedRows } from '../../src/features/finance/csv/csv-import.js';
import { financeRequest, FinanceClientError } from '../../src/features/finance/finance-client.js';
vi.mock('../../src/features/finance/finance-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/finance/finance-client.js')>()),
  financeRequest: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.resetAllMocks();
});
it.each(['0.29', '1.001', '1e3'])('handles exact decimal account entry: %s', async (amount) => {
  vi.mocked(financeRequest).mockImplementation(async (_path, options) =>
    options?.method === 'POST'
      ? {
          id: 'account',
          friendlyName: 'Bank - Checking',
          organizationName: 'Bank',
          sourceName: 'Checking',
          currency: 'USD',
          currencyExponent: 2,
          currentBalanceMinor: 29,
          balanceAt: '2026-01-01T00:00:00.000Z',
          status: 'active',
          version: 1,
          scope: { type: 'owner', ownerId: 'user' },
        }
      : { items: [] },
  );
  render(<FinanceAccountsPage ownerId="user" csrfToken="csrf" assignableGroups={[]} />);
  fireEvent.change(screen.getByLabelText('Organization name'), { target: { value: 'Bank' } });
  fireEvent.change(screen.getByLabelText('Account name'), { target: { value: 'Checking' } });
  fireEvent.change(screen.getByLabelText('Opening balance'), { target: { value: amount } });
  fireEvent.submit(screen.getByLabelText('Organization name').closest('form')!);
  const review = new DuplicateReview([
    { ordinal: 1, date: '2026-01-01', amountMinor: 29, description: 'Included' },
    { ordinal: 2, date: '2026-01-01', amountMinor: 29, description: 'Excluded' },
  ]);
  review.decide(1, 'include');
  review.decide(2, 'exclude');
  expect(review.reviewedRows([{ ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }])).toEqual([
    { ordinal: 1, duplicateDisposition: 'included-after-review' },
    { ordinal: 3, duplicateDisposition: 'not-suspected' },
  ]);
  expect(
    chunkReviewedRows(Array.from({ length: 201 }, (_, i) => i)).map((chunk) => chunk.length),
  ).toEqual([100, 100, 1]);
  if (amount === '0.29')
    await waitFor(() => {
      const call = vi
        .mocked(financeRequest)
        .mock.calls.find(([, options]) => options?.method === 'POST');
      expect(call).toBeDefined();
      expect(JSON.parse(String(call![1]!.body)).openingBalanceMinor).toBe(29);
    });
  else {
    expect(screen.getByRole('alert').textContent).toContain('at most 2 decimal places');
    expect(screen.getByRole('alert').textContent).toContain('90,071,992,547,409.91');
    expect(
      vi.mocked(financeRequest).mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(0);
  }
});

it('removes an open account view when the next Finance sync revokes its audience', async () => {
  let permitted = true;
  vi.mocked(financeRequest).mockImplementation(async (path) => ({
    items:
      path === '/finance/accounts' && permitted
        ? [
            {
              id: 'private-account',
              friendlyName: 'Sensitive checking',
              organizationName: 'Bank',
              sourceName: 'Checking',
              currency: 'USD',
              currencyExponent: 2,
              currentBalanceMinor: 100,
              balanceAt: '2026-01-01T00:00:00.000Z',
              scope: { type: 'group', groupId: 'removed' },
            },
          ]
        : [],
  }));
  render(<FinanceLandingPage ownerId="owner" role="user" csrfToken="csrf" assignableGroups={[]} />);
  await waitFor(() => expect(screen.getByText('Sensitive checking')).toBeDefined());
  permitted = false;
  window.dispatchEvent(new CustomEvent('finance-sync', { detail: { authorization: 'revoked' } }));
  await waitFor(() => expect(screen.queryByText('Sensitive checking')).toBeNull());
});
it('submits only linked USD accounts when adding a budget item', async () => {
  vi.mocked(financeRequest).mockResolvedValue({ id: 'new-item' });
  const budget = {
    id: 'budget',
    groupId: 'group',
    name: 'Plan',
    budgetDate: '2026-01-01',
    startDate: '2026-01-01',
    status: 'draft',
    items: [],
    totals: [],
    totalsComplete: true,
    version: 1,
    accountLinks: [{ accountId: 'linked', status: 'active' }],
  };
  render(
    <FinanceBudgetDetail
      budget={budget}
      accounts={[
        { id: 'linked', friendlyName: 'Linked', currency: 'USD' },
        { id: 'unlinked', friendlyName: 'Unlinked', currency: 'USD' },
      ]}
      categories={[{ id: 'category', name: 'Utilities' }]}
      currentUserId="owner"
      csrfToken="csrf"
      onChange={() => undefined}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Add budget item' }));
  expect(screen.getByRole('checkbox', { name: 'Linked' })).toBeDefined();
  expect(screen.queryByText('Unlinked')).toBeNull();
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Power' } });
  fireEvent.change(screen.getByLabelText('Planned amount'), { target: { value: '10.00' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save item' }));
  await waitFor(() => expect(vi.mocked(financeRequest)).toHaveBeenCalled());
  expect(
    JSON.parse(String(vi.mocked(financeRequest).mock.calls[0]?.[1]?.body)).relatedAccountIds,
  ).toEqual(['linked']);
});

it('preserves a running import through sync refreshes and transient polling failures', async () => {
  vi.useFakeTimers();
  let failOnce = false;
  vi.mocked(financeRequest).mockImplementation(async (path) => {
    if (path === '/finance/connections')
      return {
        items: [
          {
            id: 'bridge',
            provider: 'simplefin-bridge',
            scope: { type: 'owner', ownerId: 'owner' },
            status: 'active',
            version: 1,
          },
        ],
      };
    if (path === '/finance/connections/bridge/refresh') return { id: 'job', status: 'running' };
    if (path === '/finance/import-jobs/job') {
      if (failOnce) {
        failOnce = false;
        throw new Error('Temporary network failure');
      }
      return { status: 'running' };
    }
    return { items: [] };
  });
  await act(async () => {
    render(
      <FinanceLandingPage ownerId="owner" role="user" csrfToken="csrf" assignableGroups={[]} />,
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh SimpleFIN Bridge' }));
  });
  const polls = () =>
    vi.mocked(financeRequest).mock.calls.filter(([path]) => path === '/finance/import-jobs/job')
      .length;
  expect(polls()).toBe(1);
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent('finance-sync', { detail: { authorization: 'new-account' } }),
    );
  });
  failOnce = true;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(polls()).toBe(3);
  expect(screen.getByText(/Import running/)).toBeDefined();
});
it('stops import polling only when the connection is no longer accessible', async () => {
  vi.useFakeTimers();
  let permitted = true;
  vi.mocked(financeRequest).mockImplementation(async (path) => {
    if (path === '/finance/connections')
      return {
        items: permitted
          ? [
              {
                id: 'bridge',
                provider: 'simplefin-bridge',
                scope: { type: 'owner', ownerId: 'owner' },
                status: 'active',
                version: 1,
              },
            ]
          : [],
      };
    if (path === '/finance/connections/bridge/refresh') return { id: 'job', status: 'running' };
    if (path === '/finance/import-jobs/job') {
      if (!permitted)
        throw new FinanceClientError({
          status: 404,
          code: 'finance_not_found',
          message: 'Not found',
        });
      return { status: 'running' };
    }
    return { items: [] };
  });
  await act(async () => {
    render(
      <FinanceLandingPage ownerId="owner" role="user" csrfToken="csrf" assignableGroups={[]} />,
    );
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Refresh SimpleFIN Bridge' }));
  });
  permitted = false;
  await act(async () => {
    window.dispatchEvent(
      new CustomEvent('finance-sync', { detail: { authorization: 'removed-group' } }),
    );
    await vi.advanceTimersByTimeAsync(3000);
  });
  const before = vi
    .mocked(financeRequest)
    .mock.calls.filter(([path]) => path === '/finance/import-jobs/job').length;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(6000);
  });
  expect(
    vi.mocked(financeRequest).mock.calls.filter(([path]) => path === '/finance/import-jobs/job'),
  ).toHaveLength(before);
  expect(screen.queryByText(/Import running/)).toBeNull();
});
