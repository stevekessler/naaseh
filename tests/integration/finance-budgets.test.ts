import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  replaceTransactionAllocations,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import {
  buildFinancePersistenceItems,
  financeKeys,
  FinanceMemoryRepository,
} from '../../apps/api/src/finance/repository.js';
import {
  addFinanceBudgetItem,
  createFinanceBudget,
  getFinanceBudget,
  linkFinanceBudgetAccount,
  updateFinanceBudget,
} from '../../apps/api/src/finance/budget-service.js';

const ids = {
  group: '01J00000000000000000000301',
  budget: '01J00000000000000000000302',
  account: '01J00000000000000000000303',
  item: '01J00000000000000000000304',
  category: '01J00000000000000000000305',
  allocation: '01J00000000000000000000306',
  transaction: '01J00000000000000000000307',
  link: '01J00000000000000000000308',
};
const actor: FinanceActor = {
  id: 'member-a',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' }],
};

const setup = () => {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    ids.account,
    createFinancialAccount({
      id: ids.account,
      scope: { type: 'group', groupId: ids.group },
      sourceName: 'Checking',
      organizationName: 'Fixture Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-04-01T00:00:00.000Z',
    }),
  );
  return repository;
};

describe('Finance budget service', () => {
  it('uses collision-safe parent, account-link, and item persistence keys', () => {
    const budgetRecord = {
      id: ids.budget,
      groupId: ids.group,
      name: 'April plan',
      budgetDate: '2026-04-01',
      startDate: '2026-04-01',
      endDate: null,
      status: 'draft' as const,
      version: 1,
    };
    const link = {
      id: ids.link,
      budgetId: ids.budget,
      accountId: ids.account,
      audience: { type: 'group' as const, groupId: ids.group },
      status: 'active' as const,
      createdBy: actor.id,
      version: 1,
    };
    const item = {
      id: ids.item,
      budgetId: ids.budget,
      description: 'Groceries',
      financeCategoryId: ids.category,
      plannedAmountMinor: -10_000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [ids.account],
      creatorId: actor.id,
      status: 'active' as const,
      version: 1,
    };
    expect(financeKeys.budget(ids.budget)).toEqual({
      PK: `FINANCE#BUDGET#${ids.budget}`,
      SK: 'CURRENT',
    });
    expect(financeKeys.budgetAccountLink(ids.budget, ids.link).SK).toBe(`ACCOUNT#${ids.link}`);
    expect(financeKeys.budgetItem(ids.budget, ids.item).SK).toBe(`ITEM#${ids.item}`);
    expect(
      buildFinancePersistenceItems({
        budget: budgetRecord,
        budgetAccountLink: link,
        budgetItem: item,
      }),
    ).toHaveLength(3);
  });

  it('persists create/read/update, account links, and items idempotently', async () => {
    const repository = setup();
    const input = {
      id: ids.budget,
      groupId: ids.group,
      name: 'April plan',
      budgetDate: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    };
    const created = await createFinanceBudget(repository, actor, input, 'budget-create');
    expect(await createFinanceBudget(repository, actor, input, 'budget-create')).toEqual(created);
    await linkFinanceBudgetAccount(
      repository,
      actor,
      ids.budget,
      {
        id: ids.link,
        accountId: ids.account,
        expectedBudgetVersion: 1,
      },
      'budget-link',
    );
    await addFinanceBudgetItem(
      repository,
      actor,
      ids.budget,
      {
        id: ids.item,
        expectedBudgetVersion: 2,
        description: 'Groceries',
        financeCategoryId: ids.category,
        plannedAmountMinor: -10_000,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [ids.account],
      },
      'budget-item',
    );

    const updated = await updateFinanceBudget(
      repository,
      actor,
      ids.budget,
      {
        expectedVersion: 3,
        name: 'April household plan',
      },
      'budget-update',
    );
    const detail = getFinanceBudget(repository, actor, ids.budget);
    expect(updated).toMatchObject({ name: 'April household plan', version: 4 });
    expect(detail.accountLinks).toHaveLength(1);
    expect(detail.items).toHaveLength(1);
  });

  it('enforces active group membership and optimistic concurrency with generic failures', async () => {
    const repository = setup();
    await createFinanceBudget(
      repository,
      actor,
      {
        id: ids.budget,
        groupId: ids.group,
        name: 'April plan',
        budgetDate: '2026-04-01',
        startDate: '2026-04-01',
        endDate: null,
      },
      'budget-create',
    );
    await expect(
      updateFinanceBudget(
        repository,
        actor,
        ids.budget,
        {
          expectedVersion: 99,
          name: 'Stale edit',
        },
        'budget-stale',
      ),
    ).rejects.toThrow(/version/i);
    expect(() =>
      getFinanceBudget(repository, { ...actor, groupMemberships: [] }, ids.budget),
    ).toThrow('Finance record not found.');
  });

  it('calculates actuals from authorized allocations and excludes confirmed transfers', async () => {
    const repository = setup();
    await createFinanceBudget(
      repository,
      actor,
      {
        id: ids.budget,
        groupId: ids.group,
        name: 'April plan',
        budgetDate: '2026-04-01',
        startDate: '2026-04-01',
        endDate: '2026-04-30',
      },
      'budget-create',
    );
    await linkFinanceBudgetAccount(
      repository,
      actor,
      ids.budget,
      {
        id: ids.link,
        accountId: ids.account,
        expectedBudgetVersion: 1,
      },
      'budget-link',
    );
    await addFinanceBudgetItem(
      repository,
      actor,
      ids.budget,
      {
        id: ids.item,
        expectedBudgetVersion: 2,
        description: 'Groceries',
        financeCategoryId: ids.category,
        plannedAmountMinor: -10_000,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [ids.account],
      },
      'budget-item',
    );
    repository.transactions.push(
      replaceTransactionAllocations(
        createFinancialTransaction({
          id: ids.transaction,
          accountId: ids.account,
          origin: 'manual',
          amountMinor: -8_000,
          currency: 'USD',
          transactedAt: '2026-04-10T00:00:00.000Z',
          description: 'Groceries',
          pending: false,
          connectedAccount: false,
        }),
        [
          {
            id: ids.allocation,
            amountMinor: -8_000,
            financeCategoryId: ids.category,
            budgetItemId: ids.item,
          },
        ],
        actor.id,
      ),
    );

    expect(getFinanceBudget(repository, actor, ids.budget).totals).toEqual([
      {
        currency: 'USD',
        currencyExponent: 2,
        plannedMinor: -10_000,
        actualMinor: -8_000,
        varianceMinor: 2_000,
      },
    ]);
    repository.transactions[0] = {
      ...repository.transactions[0]!,
      transferId: 'transfer-confirmed',
    };
    repository.transfers.set('transfer-confirmed', {
      id: 'transfer-confirmed',
      scope: { type: 'group', groupId: ids.group },
      legTransactionIds: [ids.transaction, 'other-leg'],
      status: 'confirmed',
      createdBy: actor.id,
      version: 1,
    });
    expect(getFinanceBudget(repository, actor, ids.budget).totals[0]).toMatchObject({
      actualMinor: 0,
    });
  });
});
