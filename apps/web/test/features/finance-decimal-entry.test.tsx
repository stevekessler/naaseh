// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FinanceAccountsPage } from '../../src/features/finance/accounts/FinanceAccountsPage.js';
import { DuplicateReview, chunkReviewedRows } from '../../src/features/finance/csv/csv-import.js';
import { financeRequest } from '../../src/features/finance/finance-client.js';
vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: vi.fn() }));
afterEach(() => {
  cleanup();
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
    expect(screen.getByRole('alert').textContent).toContain('exact');
    expect(
      vi.mocked(financeRequest).mock.calls.filter(([, options]) => options?.method === 'POST'),
    ).toHaveLength(0);
  }
});
