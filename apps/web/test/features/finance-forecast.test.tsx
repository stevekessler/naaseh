// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BudgetForecast } from '../../src/features/finance/budgets/BudgetForecast.js';

const f = vi.hoisted(() => {
  const locks = new Set<() => void>();
  const access = {
    ownerId: 'owner',
    canRead: () => true,
    onLock: (callback: () => void) => {
      locks.add(callback);
      return () => locks.delete(callback);
    },
  };
  return { locks, access, financeRequest: vi.fn() };
});
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  peekFinanceAccess: () => f.access,
  subscribeFinanceAccess: () => () => {},
}));
vi.mock('../../src/features/finance/finance-client.js', () => ({
  financeRequest: f.financeRequest,
}));

const budgetId = '01J00000000000000000000001';
const historical = {
  budgetId,
  method: 'historical',
  includeNonBudgetedHistory: false,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  window: { dateFrom: '2026-11-01', dateTo: '2026-11-30', basis: 'budget' },
  asOfDate: '2026-11-22',
  sourceAsOf: '2026-11-22T12:00:00.000Z',
  sourceRevision: 'protected-source',
  coverage: 'partial',
  status: 'insufficient-history',
  observed: { dateFrom: '2026-05-01', dateTo: '2026-10-31', coveredMonths: 2 },
  currencies: [],
};

function renderForecast(overview = false) {
  return render(
    <BudgetForecast
      budgetId={budgetId}
      ownerId="owner"
      overview={overview}
      csrfToken="test"
      verifyAccess={async () => true}
    />,
  );
}

beforeEach(() => {
  f.financeRequest.mockReset();
});
afterEach(cleanup);

it('requires an explicit request and defaults to budget-only history', async () => {
  f.financeRequest.mockResolvedValue(historical);
  const view = renderForecast();
  fireEvent.change(view.getByLabelText('Forecast method'), { target: { value: 'historical' } });
  const optIn = view.getByRole<HTMLInputElement>('checkbox', {
    name: /Include non-budgeted history/,
  });
  expect(optIn.checked).toBe(false);
  expect(f.financeRequest).not.toHaveBeenCalled();
  fireEvent.click(view.getByRole('button', { name: 'Run forecast' }));
  await view.findByText(/Insufficient history/);
  expect(view.getByText(/Partial coverage/)).toBeTruthy();
  expect(JSON.parse(f.financeRequest.mock.calls[0]![1].body)).toMatchObject({
    method: 'historical',
    includeNonBudgetedHistory: false,
  });
  fireEvent.click(optIn);
  expect(view.queryByText(/Insufficient history/)).toBeNull();
  expect(f.financeRequest).toHaveBeenCalledTimes(1);
});

it('clears a pending forecast on Finance lock and ignores late results', async () => {
  let finish: (result: unknown) => void = () => {};
  f.financeRequest.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = renderForecast(true);
  fireEvent.change(view.getByLabelText('Forecast method'), { target: { value: 'historical' } });
  expect(view.queryByRole('checkbox', { name: /Include non-budgeted history/ })).toBeNull();
  fireEvent.click(view.getByRole('button', { name: 'Run forecast' }));
  await waitFor(() => expect(f.financeRequest).toHaveBeenCalledOnce());
  const signal = f.financeRequest.mock.calls[0]![1].signal as AbortSignal;
  await act(async () => {
    for (const lock of f.locks) lock();
    finish(historical);
  });
  expect(signal.aborted).toBe(true);
  expect(view.queryByLabelText('Forecast results')).toBeNull();
});
