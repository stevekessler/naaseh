// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  groups: vi.fn(),
  load: vi.fn(),
  read: vi.fn(),
  dispose: vi.fn(),
}));

vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/db/group-repository.js', () => ({ listLocalGroups: f.groups }));
vi.mock('../../src/features/finance/security/finance-access.js', () => ({
  subscribeFinanceAccess: () => () => undefined,
  peekFinanceAccess: () => ({ canRead: () => false, onLock: () => () => undefined }),
}));
vi.mock('../../src/db/finance-repository.js', () => ({
  queueEncryptedBudgetCreationPlan: vi.fn(),
  queueEncryptedBudgetMutation: vi.fn(),
}));
vi.mock('../../src/sync/finance-api-snapshot.js', () => ({
  loadFinanceApiSnapshot: f.load,
  readFinanceApiSnapshot: f.read,
  disposeFinanceApiSnapshot: f.dispose,
}));
vi.mock('../../src/features/finance/budgets/FinanceBudgetDetail.js', () => ({
  FinanceBudgetDetail: () => <div>Budget detail</div>,
}));
vi.mock('../../src/features/finance/budgets/ReusableItemsPage.js', () => ({
  ReusableItemsPage: () => null,
}));

import { FinanceBudgetsPage } from '../../src/features/finance/budgets/FinanceBudgetsPage.js';

const household = {
  id: 'group-household',
  name: 'Household',
  ownerId: 'owner',
  status: 'active',
  hasJoinPin: false,
  joined: true,
  role: 'member',
  version: 1,
};

beforeEach(() => {
  vi.resetAllMocks();
  f.groups.mockResolvedValue([
    household,
    { ...household, id: 'group-archived', name: 'Old group', status: 'archived' },
    { ...household, id: 'group-unjoined', name: 'Public group', joined: false },
  ]);
  f.request.mockImplementation(async (path: string, options?: { method?: string }) => {
    if (options?.method === 'POST')
      return {
        id: 'budget-created',
        groupId: household.id,
        name: 'December plan',
        budgetDate: '2026-12-01',
        startDate: '2026-12-01',
        endDate: null,
        status: 'active',
        activity: 'active',
        items: [],
        totals: [],
        totalsComplete: true,
        version: 1,
      };
    if (path === '/finance/budgets') return { items: [] };
    if (path === '/finance/accounts') return { items: [] };
    if (path === '/finance/categories') return { items: [] };
    return {
      id: 'budget-created',
      groupId: household.id,
      name: 'December plan',
      status: 'active',
      activity: 'active',
      items: [],
      totals: [],
      totalsComplete: true,
      version: 1,
    };
  });
  f.load.mockImplementation(async (load: (request: typeof f.request) => Promise<unknown>) => ({
    value: await load(f.request),
  }));
  f.read.mockImplementation(async (token, read: (value: unknown) => unknown) => read(token.value));
});

afterEach(cleanup);

const completeForm = (view: ReturnType<typeof render>) => {
  fireEvent.change(view.getByLabelText('Budget name'), { target: { value: 'December plan' } });
  fireEvent.change(view.getByLabelText('Group'), { target: { value: household.id } });
  fireEvent.change(view.getByLabelText('Budget date'), { target: { value: '2026-12-01' } });
  fireEvent.change(view.getByLabelText('Start date'), { target: { value: '2026-12-01' } });
};

describe('Finance budget membership choices', () => {
  it('uses active joined group names and saves an account-less budget active', async () => {
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="member-a" />);
    await waitFor(() => expect(f.groups).toHaveBeenCalled());
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));

    const group = view.getByLabelText('Group');
    expect(
      (within(group).getByRole('option', { name: 'Household' }) as HTMLOptionElement).value,
    ).toBe(household.id);
    expect(within(group).queryByRole('option', { name: 'Old group' })).toBeNull();
    expect(within(group).queryByRole('option', { name: 'Public group' })).toBeNull();
    expect(
      view.getByText('No accounts are required. You can link authorized accounts later.'),
    ).toBeTruthy();

    completeForm(view);
    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);

    await waitFor(() =>
      expect(f.request).toHaveBeenCalledWith(
        '/finance/budgets',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"status":"active"'),
        }),
      ),
    );
    expect(
      f.request.mock.calls.some(
        ([path, options]) =>
          String(path).includes('/accounts') &&
          (options as { method?: string } | undefined)?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('shows an actionable no-membership state instead of an identifier field', async () => {
    f.groups.mockResolvedValue([]);
    const openGroups = vi.fn();
    const view = render(
      <FinanceBudgetsPage csrfToken="csrf" currentUserId="member-a" onOpenGroups={openGroups} />,
    );
    await waitFor(() => expect(f.groups).toHaveBeenCalled());
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));

    expect(view.getByText(/not currently an active member of an eligible group/i)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Manage groups' }));
    expect(openGroups).toHaveBeenCalledTimes(1);
  });

  it('retains every entered value when membership is revoked during save', async () => {
    const view = render(<FinanceBudgetsPage csrfToken="csrf" currentUserId="member-a" />);
    await waitFor(() => expect(f.groups).toHaveBeenCalled());
    fireEvent.click(view.getByRole('button', { name: 'Create budget' }));
    completeForm(view);
    f.request.mockRejectedValueOnce(new Error('Finance record not found.'));

    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);

    expect(await view.findByText(/membership may have changed/i)).toBeTruthy();
    expect(view.getByDisplayValue('December plan')).toBeTruthy();
    expect((view.getByLabelText('Group') as HTMLSelectElement).value).toBe(household.id);
    expect((view.getByLabelText('Budget date') as HTMLInputElement).value).toBe('2026-12-01');
    expect((view.getByLabelText('Start date') as HTMLInputElement).value).toBe('2026-12-01');
    expect(view.getByRole('dialog')).toBeTruthy();
  });
});
