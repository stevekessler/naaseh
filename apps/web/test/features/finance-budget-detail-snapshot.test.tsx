// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  request: vi.fn(),
  verify: vi.fn(),
  changed: vi.fn(),
  queue: vi.fn(),
}));

vi.mock('../../src/features/finance/finance-client.js', () => ({ financeRequest: f.request }));
vi.mock('../../src/db/finance-repository.js', () => ({
  queueEncryptedBudgetMutation: f.queue,
}));
vi.mock('../../src/sync/finance-sync.js', () => ({
  queueFinanceBudgetActivityChange: (input: unknown) => f.queue(input),
}));

import {
  FinanceBudgetDetail,
  type BudgetDetailView,
} from '../../src/features/finance/budgets/FinanceBudgetDetail.js';
import { BudgetReconciliation } from '../../src/features/finance/budgets/BudgetReconciliation.js';
import { CreateFinancialTask } from '../../src/features/finance/budgets/CreateFinancialTask.js';

const budget: BudgetDetailView = {
  id: 'budget-one',
  groupId: 'group-one',
  name: 'Private plan',
  budgetDate: '2026-11-01',
  startDate: '2026-11-01',
  endDate: null,
  status: 'active',
  items: [],
  totals: [],
  totalsComplete: true,
  version: 4,
};

const renderDetail = () =>
  render(
    <FinanceBudgetDetail
      budget={budget}
      accounts={[{ id: 'account-one', friendlyName: 'Private account', currency: 'USD' }]}
      categories={[{ id: 'category-one', name: 'Private category' }]}
      csrfToken="csrf"
      currentUserId="owner"
      verifyAccess={f.verify}
      onChange={f.changed}
    />,
  );

const completeItem = (view: ReturnType<typeof renderDetail>) => {
  fireEvent.click(view.getByRole('button', { name: 'Add budget item' }));
  fireEvent.change(view.getByLabelText('Description'), { target: { value: 'Private item' } });
  fireEvent.change(view.getByLabelText('Planned amount'), { target: { value: '12.34' } });
  fireEvent.submit(view.getByRole('dialog').querySelector('form')!);
};

beforeEach(() => {
  vi.resetAllMocks();
  f.verify.mockResolvedValue(true);
  f.request.mockResolvedValue({ id: 'misleading-item', description: 'Unverified reply' });
  f.queue.mockResolvedValue({});
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
});
afterEach(cleanup);

describe('budget detail retained-source writes', () => {
  it('queues an encrypted conflict-aware activity command while offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    f.request.mockRejectedValue(new TypeError('offline'));
    const view = renderDetail();

    fireEvent.click(view.getByRole('button', { name: 'Deactivate' }));

    await view.findByText(/deactivation queued securely/i);
    expect(f.queue).toHaveBeenCalledWith(
      expect.objectContaining({
        budget,
        activity: 'inactive',
        actorId: 'owner',
      }),
    );
    expect(f.changed).not.toHaveBeenCalled();
  });

  it('does not send an item write after the displayed budget loses access', async () => {
    f.verify.mockResolvedValue(false);
    const view = renderDetail();
    completeItem(view);
    await waitFor(() => expect(f.verify).toHaveBeenCalledOnce());
    expect(f.request).not.toHaveBeenCalled();
    expect(f.changed).not.toHaveBeenCalled();
  });

  it('ignores a completed write response when access changes before canonical refresh', async () => {
    let finish!: (value: unknown) => void;
    f.request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    f.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const view = renderDetail();
    completeItem(view);
    await waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    await act(async () => {
      finish({ id: 'item-one', description: 'Private server reply' });
    });
    await waitFor(() => expect(f.verify).toHaveBeenCalledTimes(2));
    expect(f.changed).not.toHaveBeenCalled();
    expect(view.queryByText('Private server reply')).toBeNull();
  });

  it('reloads the canonical budget after a verified write without publishing the raw reply', async () => {
    const view = renderDetail();
    completeItem(view);
    await waitFor(() => expect(f.changed).toHaveBeenCalledExactlyOnceWith(budget));
    expect(f.verify).toHaveBeenCalledTimes(2);
    expect(view.queryByText('Unverified reply')).toBeNull();
  });

  it('queues a stable encrypted item offline and does not publish it as canonical state', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    f.request.mockRejectedValue(new TypeError('offline'));
    const view = renderDetail();
    completeItem(view);
    await view.findByRole('status');
    expect(f.queue).toHaveBeenCalledOnce();
    expect(f.queue.mock.calls[0]![0]).toMatchObject({
      entityType: 'financeBudgetItem',
      budgetId: budget.id,
      scopeKey: `GROUP#${budget.groupId}`,
      baseVersion: 0,
      value: {
        budgetId: budget.id,
        expectedBudgetVersion: budget.version,
        description: 'Private item',
        financeCategoryId: 'category-one',
        plannedAmountMinor: -1234,
        relatedAccountIds: ['account-one'],
      },
    });
    expect(f.verify).toHaveBeenCalledTimes(2);
    expect(f.changed).not.toHaveBeenCalled();
    expect(view.queryByRole('dialog')).toBeNull();
  });

  it('keeps the offline item form available when encrypted queueing fails', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    f.request.mockRejectedValue(new TypeError('offline'));
    f.queue.mockRejectedValue(new Error('storage unavailable'));
    const view = renderDetail();
    completeItem(view);
    await view.findByText('The item could not be queued securely. Your form is still available.');
    expect(view.getByRole('dialog')).toBeTruthy();
    expect((view.getByLabelText('Description') as HTMLInputElement).value).toBe('Private item');
    expect(f.changed).not.toHaveBeenCalled();
  });
});

describe('budget reconciliation retained-source writes', () => {
  const renderReconciliation = () =>
    render(
      <BudgetReconciliation
        budget={budget}
        csrfToken="csrf"
        verifyAccess={f.verify}
        onReconciled={f.changed}
      />,
    );

  const confirm = (view: ReturnType<typeof renderReconciliation>) => {
    fireEvent.click(view.getByRole('button', { name: 'Reconcile budget' }));
    fireEvent.click(view.getByRole('button', { name: 'Confirm reconciliation' }));
  };

  it('does not reconcile after the displayed budget loses access', async () => {
    f.verify.mockResolvedValue(false);
    const view = renderReconciliation();
    confirm(view);
    await waitFor(() => expect(f.verify).toHaveBeenCalledOnce());
    expect(f.request).not.toHaveBeenCalled();
    expect(f.changed).not.toHaveBeenCalled();
  });

  it('reloads canonical budget state only after access survives the write', async () => {
    f.request.mockResolvedValue({
      id: 'reconciliation-one',
      reconciledBy: 'private-reply',
      reconciledAt: '2026-11-12T00:00:00Z',
    });
    const view = renderReconciliation();
    confirm(view);
    await waitFor(() => expect(f.changed).toHaveBeenCalledOnce());
    expect(f.verify).toHaveBeenCalledTimes(2);
    expect(view.queryByText(/private-reply/u)).toBeNull();
  });
});

describe('budget task-link retained-source writes', () => {
  const renderTask = () =>
    render(
      <CreateFinancialTask
        budgetItemId="item-one"
        description="Private planned item"
        currentUserId="owner"
        csrfToken="csrf"
        verifyAccess={f.verify}
      />,
    );

  const submit = (view: ReturnType<typeof renderTask>) => {
    fireEvent.click(view.getByRole('button', { name: 'Create task' }));
    fireEvent.submit(view.getByRole('dialog').querySelector('form')!);
  };

  it('does not send a task-link write after the displayed budget loses access', async () => {
    f.verify.mockResolvedValue(false);
    const view = renderTask();
    submit(view);
    await waitFor(() => expect(f.verify).toHaveBeenCalledOnce());
    expect(f.request).not.toHaveBeenCalled();
    expect(view.queryByRole('link', { name: 'Open created task' })).toBeNull();
  });

  it('does not publish a late task link after access changes', async () => {
    let finish!: (value: unknown) => void;
    f.request.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    f.verify.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const view = renderTask();
    submit(view);
    await waitFor(() => expect(f.request).toHaveBeenCalledOnce());
    await act(async () => {
      finish({ taskId: 'private-task', financialTaskLinkId: 'private-link' });
    });
    await waitFor(() => expect(f.verify).toHaveBeenCalledTimes(2));
    expect(view.queryByRole('link', { name: 'Open created task' })).toBeNull();
  });

  it('publishes the ordinary task destination after the retained source survives the write', async () => {
    f.request.mockResolvedValue({ taskId: 'task-one', financialTaskLinkId: 'link-one' });
    const view = renderTask();
    submit(view);
    const link = await view.findByRole('link', { name: 'Open created task' });
    expect(link.getAttribute('href')).toBe('/tasks/task-one');
    expect(f.verify).toHaveBeenCalledTimes(2);
  });
});
