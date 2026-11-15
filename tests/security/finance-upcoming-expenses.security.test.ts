import { describe, expect, it } from 'vitest';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  createUpcomingExpenseRecord,
  getUpcomingExpenseRecord,
  revokeUpcomingExpenseOwnerProjection,
} from '../../apps/api/src/finance/upcoming-expense-service.js';
import {
  buildExperienceFixture,
  experienceId,
  EXPERIENCE_GROUP_ID,
  EXPERIENCE_OTHER_GROUP_ID,
} from '../fixtures/finance/experience.js';

describe('upcoming expense account/budget/group access intersection', () => {
  it('requires every current source and hides the record after account revocation', () => {
    const fixture = buildExperienceFixture();
    const repository = new FinanceMemoryRepository();
    for (const account of fixture.accounts) repository.accounts.set(account.id, account);
    for (const budget of fixture.budgets) repository.budgets.set(budget.id, budget);
    const account = fixture.accounts[1]!;
    const input = {
      id: experienceId(880),
      groupId: EXPERIENCE_GROUP_ID,
      accountId: account.id,
      budgetId: fixture.budgets[0]!.id,
      description: 'Protected obligation',
      expectedAmountMinor: 4_000,
      dueDate: '2026-11-03',
      entryContext: {
        enteredAt: '2026-10-31T18:00:00.000Z',
        localDate: '2026-10-31',
        timeZone: 'America/Denver',
      },
    };
    expect(() =>
      createUpcomingExpenseRecord(repository, fixture.actors.outsider, input, 'outsider-create'),
    ).toThrow(/not found|access/iu);
    const created = createUpcomingExpenseRecord(
      repository,
      fixture.actors.owner,
      input,
      'owner-create',
    );
    expect(getUpcomingExpenseRecord(repository, fixture.actors.owner, created.expense.id)).toEqual(
      created,
    );
    expect(repository.feedChanges.at(-1)).toMatchObject({
      audience: `OWNER#${fixture.actors.owner.id}`,
      entityType: 'financeUpcomingExpense',
      operation: 'upsert',
    });
    repository.accounts.set(account.id, {
      ...account,
      scope: { type: 'group', groupId: EXPERIENCE_OTHER_GROUP_ID },
    });
    expect(
      getUpcomingExpenseRecord(repository, fixture.actors.owner, created.expense.id),
    ).toBeUndefined();
    expect(() =>
      createUpcomingExpenseRecord(repository, fixture.actors.owner, input, 'owner-create'),
    ).toThrow(/not found|access/iu);
    const tombstones = revokeUpcomingExpenseOwnerProjection(
      repository,
      fixture.actors.owner.id,
      created.expense.id,
      '2026-11-01T00:00:00.000Z',
    );
    expect(tombstones).toEqual([
      expect.objectContaining({
        audience: `OWNER#${fixture.actors.owner.id}`,
        entityType: 'financeUpcomingExpense',
        operation: 'tombstone',
      }),
    ]);
    expect(tombstones[0]).not.toHaveProperty('payload');
  });
});
