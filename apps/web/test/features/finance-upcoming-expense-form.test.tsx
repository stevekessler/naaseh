// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UpcomingExpenseForm } from '../../src/features/finance/upcoming/UpcomingExpenseForm.js';

afterEach(cleanup);

const group = { id: '01K00000000000000000000001', name: 'Household' };
const account = {
  id: '01K00000000000000000000101',
  name: 'Checking',
  currency: 'USD',
  scope: { type: 'group' as const, groupId: group.id },
};
const budget = {
  id: '01K00000000000000000000200',
  name: 'November plan',
  groupId: group.id,
  status: 'active' as const,
  activity: 'active' as const,
};

function complete(view: ReturnType<typeof render>) {
  fireEvent.change(view.getByLabelText('Description'), { target: { value: 'Registration' } });
  fireEvent.change(view.getByLabelText('Expected amount'), { target: { value: '30.00' } });
  fireEvent.change(view.getByLabelText('Date'), { target: { value: '2026-11-02' } });
  fireEvent.change(view.getByLabelText('Budget'), { target: { value: budget.id } });
}

describe('upcoming expense original browser context', () => {
  it('preselects account/group and captures the original local day and zone at confirmation', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <UpcomingExpenseForm
        accounts={[account]}
        budgets={[budget]}
        groups={[group]}
        initialAccountId={account.id}
        now={() => new Date('2026-10-31T18:00:00.000Z')}
        onSave={save}
      />,
    );
    complete(view);
    fireEvent.click(view.getByRole('button', { name: 'Save upcoming expense' }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedAmountMinor: 3_000,
        accountId: account.id,
        groupId: group.id,
        budgetId: budget.id,
        dueDate: '2026-11-02',
        entryContext: expect.objectContaining({
          enteredAt: '2026-10-31T18:00:00.000Z',
          localDate: expect.stringMatching(/^2026-10-(31|30)$/u),
          timeZone: expect.any(String),
        }),
      }),
    );
  });

  it('retains all input after a denied save and explains that no payment is posted', async () => {
    const view = render(
      <UpcomingExpenseForm
        accounts={[account]}
        budgets={[budget]}
        groups={[group]}
        initialAccountId={account.id}
        now={() => new Date('2026-10-31T18:00:00.000Z')}
        onSave={vi.fn().mockRejectedValue(new Error('revoked'))}
      />,
    );
    complete(view);
    fireEvent.click(view.getByRole('button', { name: 'Save upcoming expense' }));
    expect(await view.findByText(/entries are still available/i)).toBeTruthy();
    expect(view.getByDisplayValue('Registration')).toBeTruthy();
    expect(view.getByDisplayValue('30.00')).toBeTruthy();
    expect(view.getByText(/does not post a payment or change a balance/i)).toBeTruthy();
  });

  it('excludes inactive budgets from new selections', () => {
    const view = render(
      <UpcomingExpenseForm
        accounts={[account]}
        budgets={[{ ...budget, activity: 'inactive' }]}
        groups={[group]}
        initialAccountId={account.id}
        onSave={vi.fn()}
      />,
    );
    expect(view.queryByRole('option', { name: budget.name })).toBeNull();
    expect(view.getByText(/create or reactivate an open budget/i)).toBeTruthy();
  });
});
