import { describe, expect, it } from 'vitest';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import {
  closeFinanceBudget,
  createFinanceBudget,
  deactivateFinanceBudget,
  getFinanceBudget,
  linkFinanceBudgetAccount,
  reactivateFinanceBudget,
  updateFinanceBudget,
} from '../../apps/api/src/finance/budget-service.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { createFinancialAccount, createFinancialTaskLink } from '@naaseh/domain';

const ids = {
  group: '01J00000000000000000000501',
  budget: '01J00000000000000000000502',
  account: '01J00000000000000000000503',
  link: '01J00000000000000000000504',
  item: '01J00000000000000000000505',
  task: '01J00000000000000000000506',
  taskLink: '01J00000000000000000000507',
  reconciliation: '01J00000000000000000000508',
};

const actor: FinanceActor = {
  id: 'member-a',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' }],
};

const input = {
  id: ids.budget,
  groupId: ids.group,
  name: 'Household plan',
  budgetDate: '2026-11-01',
  startDate: '2026-11-01',
  endDate: null,
};

describe('Finance budget group selection and activity', () => {
  it('saves an account-less budget active immediately for a current group member', async () => {
    const repository = new FinanceMemoryRepository();

    const created = await createFinanceBudget(repository, actor, input, 'create-active');

    expect(created).toMatchObject({ status: 'active', activity: 'active', version: 1 });
    expect(created.activityChangedBy).toBe(actor.id);
    expect(created.activityChangedAt).toEqual(expect.any(String));
    expect(repository.budgetAccountLinks.size).toBe(0);
    expect(getFinanceBudget(repository, actor, ids.budget)).toMatchObject({
      status: 'active',
      activity: 'active',
      accountLinks: [],
    });
  });

  it('deactivates and reactivates without changing links, history, flags, or identity', async () => {
    const repository = new FinanceMemoryRepository();
    repository.accounts.set(
      ids.account,
      createFinancialAccount({
        id: ids.account,
        scope: { type: 'group', groupId: ids.group },
        sourceName: 'Checking',
        organizationName: 'Fixture bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-11-01T00:00:00.000Z',
      }),
    );
    await createFinanceBudget(repository, actor, input, 'create-linked');
    await linkFinanceBudgetAccount(
      repository,
      actor,
      ids.budget,
      { id: ids.link, accountId: ids.account, expectedBudgetVersion: 1 },
      'link-account',
    );
    repository.budgets.set(ids.budget, {
      ...repository.budgets.get(ids.budget)!,
      lastReconciledAt: '2026-11-02T00:00:00.000Z',
    });
    repository.budgetReconciliations.push({
      id: ids.reconciliation,
      budgetId: ids.budget,
      reconciledAt: '2026-11-02T00:00:00.000Z',
      reconciledBy: actor.id,
      budgetVersion: 2,
      sourceVersionDigest: 'a'.repeat(64),
      totalsByCurrency: [],
      totalsByCategory: [],
    });
    repository.financialTaskLinks.set(
      ids.taskLink,
      createFinancialTaskLink({
        id: ids.taskLink,
        budgetId: ids.budget,
        budgetItemId: ids.item,
        taskId: ids.task,
        groupId: ids.group,
        createdBy: actor.id,
        now: new Date('2026-11-02T00:00:00.000Z'),
      }),
    );

    const inactive = await deactivateFinanceBudget(
      repository,
      actor,
      ids.budget,
      { expectedVersion: 2 },
      'deactivate',
      new Date('2026-11-03T00:00:00.000Z'),
    );
    expect(inactive).toMatchObject({
      id: ids.budget,
      status: 'active',
      activity: 'inactive',
      activityChangedAt: '2026-11-03T00:00:00.000Z',
      activityChangedBy: actor.id,
      lastReconciledAt: '2026-11-02T00:00:00.000Z',
      version: 3,
    });

    const active = await reactivateFinanceBudget(
      repository,
      actor,
      ids.budget,
      { expectedVersion: 3 },
      'reactivate',
      new Date('2026-11-04T00:00:00.000Z'),
    );
    expect(active).toMatchObject({
      id: ids.budget,
      status: 'active',
      activity: 'active',
      lastReconciledAt: '2026-11-02T00:00:00.000Z',
      version: 4,
    });
    expect(repository.budgetAccountLinks.get(ids.link)?.status).toBe('active');
    expect(repository.budgetReconciliations.map(({ id }) => id)).toEqual([ids.reconciliation]);
    expect(repository.financialTaskLinks.get(ids.taskLink)?.status).toBe('active');
  });

  it('reactivates activity without reopening a separately closed budget', async () => {
    const repository = new FinanceMemoryRepository();
    await createFinanceBudget(repository, actor, input, 'create-closed');
    await deactivateFinanceBudget(
      repository,
      actor,
      ids.budget,
      { expectedVersion: 1 },
      'deactivate-closed',
      new Date('2026-11-03T00:00:00.000Z'),
    );
    await closeFinanceBudget(
      repository,
      actor,
      ids.budget,
      { expectedVersion: 2 },
      'close',
      new Date('2026-11-04T00:00:00.000Z'),
    );

    const reactivated = await reactivateFinanceBudget(
      repository,
      actor,
      ids.budget,
      { expectedVersion: 3 },
      'reactivate-closed',
      new Date('2026-11-05T00:00:00.000Z'),
    );

    expect(reactivated).toMatchObject({
      activity: 'active',
      closedAt: '2026-11-04T00:00:00.000Z',
      closedBy: actor.id,
      version: 4,
    });
  });

  it('maps legacy drafts inactive and activates them only through an explicit save', async () => {
    const repository = new FinanceMemoryRepository();
    repository.budgets.set(ids.budget, {
      ...input,
      status: 'draft',
      version: 1,
    });

    expect(getFinanceBudget(repository, actor, ids.budget)).toMatchObject({
      status: 'draft',
      activity: 'inactive',
    });

    const saved = await updateFinanceBudget(
      repository,
      actor,
      ids.budget,
      { expectedVersion: 1, status: 'active' },
      'save-legacy-active',
    );
    expect(saved).toMatchObject({ status: 'active', activity: 'active', version: 2 });
  });

  it('denies a revoked member without changing the retained budget', async () => {
    const repository = new FinanceMemoryRepository();
    await createFinanceBudget(repository, actor, input, 'create-before-revoke');
    const revoked = { ...actor, groupMemberships: [] };

    await expect(
      deactivateFinanceBudget(
        repository,
        revoked,
        ids.budget,
        { expectedVersion: 1 },
        'revoked-deactivate',
      ),
    ).rejects.toThrow('Finance record not found.');
    expect(repository.budgets.get(ids.budget)).toMatchObject({ activity: 'active', version: 1 });
  });
});
