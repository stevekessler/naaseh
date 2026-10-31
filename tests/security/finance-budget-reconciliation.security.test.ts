import { describe, expect, it } from 'vitest';
import { createFinancialAccount } from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import {
  createFinanceBudget,
  linkFinanceBudgetAccount,
} from '../../apps/api/src/finance/budget-service.js';
import { reconcileFinanceBudget } from '../../apps/api/src/finance/reconciliation-service.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';

const ids = {
  group: '01J00000000000000000000931',
  budget: '01J00000000000000000000932',
  privateAccount: '01J00000000000000000000933',
  link: '01J00000000000000000000934',
  reconciliation: '01J00000000000000000000935',
};
const owner: FinanceActor = {
  id: 'owner-1',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'owner' }],
};
const member: FinanceActor = {
  id: 'member-2',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' }],
};

describe('Budget reconciliation authorization', () => {
  it('rejects an incomplete private-account view without disclosing the hidden account', async () => {
    const repository = new FinanceMemoryRepository();
    repository.accounts.set(
      ids.privateAccount,
      createFinancialAccount({
        id: ids.privateAccount,
        scope: { type: 'owner', ownerId: owner.id },
        sourceName: 'Private checking',
        organizationName: 'Hidden',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 12_345,
        balanceAt: '2027-09-01T00:00:00.000Z',
      }),
    );
    await createFinanceBudget(
      repository,
      owner,
      {
        id: ids.budget,
        groupId: ids.group,
        name: 'Shared',
        budgetDate: '2027-09-01',
        startDate: '2027-09-01',
        status: 'active',
      },
      'budget',
    );
    await linkFinanceBudgetAccount(
      repository,
      owner,
      ids.budget,
      { id: ids.link, accountId: ids.privateAccount, expectedBudgetVersion: 1 },
      'link',
    );

    let message = '';
    try {
      await reconcileFinanceBudget(
        repository,
        member,
        ids.budget,
        {
          id: ids.reconciliation,
          expectedVersion: 2,
        },
        'reconcile',
      );
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toBe('Budget reconciliation requires a complete authorized view.');
    expect(message).not.toMatch(/private|checking|hidden|12|account/i);
    expect(repository.budgetReconciliations).toHaveLength(0);
  });

  it('uses generic not-found behavior for nonmembers and administrators', async () => {
    const repository = new FinanceMemoryRepository();
    await createFinanceBudget(
      repository,
      owner,
      {
        id: ids.budget,
        groupId: ids.group,
        name: 'Shared',
        budgetDate: '2027-09-01',
        startDate: '2027-09-01',
        status: 'active',
      },
      'budget',
    );
    for (const actor of [
      { id: 'outsider', role: 'user' as const, active: true, groupMemberships: [] },
      { id: 'admin', role: 'admin' as const, active: true, groupMemberships: [] },
    ]) {
      await expect(
        reconcileFinanceBudget(
          repository,
          actor,
          ids.budget,
          {
            id: ids.reconciliation,
            expectedVersion: 1,
          },
          `attempt-${actor.id}`,
        ),
      ).rejects.toThrow(/^Finance record not found\.$/u);
    }
  });
});
