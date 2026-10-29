import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  replaceTransactionAllocations,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import {
  addFinanceBudgetItem,
  createFinanceBudget,
  getFinanceBudget,
  linkFinanceBudgetAccount,
} from '../../apps/api/src/finance/budget-service.js';
import {
  listBudgetReconciliationHistory,
  reconcileFinanceBudget,
} from '../../apps/api/src/finance/reconciliation-service.js';
import {
  buildBudgetReconciliationTransaction,
  buildFinancePersistenceItems,
  financeKeys,
  FinanceMemoryRepository,
} from '../../apps/api/src/finance/repository.js';
import { updateManualTransaction } from '../../apps/api/src/finance/transaction-service.js';

const ids = {
  group: '01J00000000000000000000921',
  budget: '01J00000000000000000000922',
  account: '01J00000000000000000000923',
  link: '01J00000000000000000000924',
  item: '01J00000000000000000000925',
  transaction: '01J00000000000000000000926',
  allocation: '01J00000000000000000000927',
  category: '01J00000000000000000000928',
  reconciliation: '01J00000000000000000000929',
};
const actor: FinanceActor = {
  id: 'member-1',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' }],
};

async function setup() {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    ids.account,
    createFinancialAccount({
      id: ids.account,
      scope: { type: 'group', groupId: ids.group },
      sourceName: 'Checking',
      organizationName: 'Fixture',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2027-09-01T00:00:00.000Z',
    }),
  );
  await createFinanceBudget(
    repository,
    actor,
    {
      id: ids.budget,
      groupId: ids.group,
      name: 'September',
      budgetDate: '2027-09-01',
      startDate: '2027-09-01',
      endDate: '2027-09-30',
      status: 'active',
    },
    'budget',
  );
  await linkFinanceBudgetAccount(
    repository,
    actor,
    ids.budget,
    { id: ids.link, accountId: ids.account, expectedBudgetVersion: 1 },
    'link',
  );
  await addFinanceBudgetItem(
    repository,
    actor,
    ids.budget,
    {
      id: ids.item,
      expectedBudgetVersion: 2,
      description: 'Utilities',
      financeCategoryId: ids.category,
      plannedAmountMinor: -5_000,
      currency: 'USD',
      relatedAccountIds: [ids.account],
    },
    'item',
  );
  const transaction = replaceTransactionAllocations(
    createFinancialTransaction({
      id: ids.transaction,
      accountId: ids.account,
      origin: 'manual',
      amountMinor: -4_500,
      currency: 'USD',
      transactedAt: '2027-09-15T12:00:00.000Z',
      description: 'Utilities',
      pending: false,
      connectedAccount: false,
    }),
    [
      {
        id: ids.allocation,
        amountMinor: -4_500,
        financeCategoryId: ids.category,
        budgetItemId: ids.item,
      },
    ],
    actor.id,
  );
  repository.transactions.push(transaction);
  return repository;
}

describe('Finance budget reconciliation', () => {
  it('appends immutable evidence under a budget reconciliation key and replays safely', async () => {
    const repository = await setup();
    const record = await reconcileFinanceBudget(
      repository,
      actor,
      ids.budget,
      {
        id: ids.reconciliation,
        expectedVersion: 3,
      },
      'reconcile',
      new Date('2027-09-30T23:00:00.000Z'),
    );
    expect(record).toMatchObject({
      budgetId: ids.budget,
      reconciledBy: actor.id,
      budgetVersion: 3,
      totalsByCurrency: [{ actualMinor: -4_500, varianceMinor: 500 }],
    });
    expect(
      financeKeys.budgetReconciliation(ids.budget, record.reconciledAt, record.id).SK,
    ).toContain(`RECON#${record.reconciledAt}#${record.id}`);
    expect(buildFinancePersistenceItems({ reconciliation: record })).toHaveLength(1);
    const writes = buildBudgetReconciliationTransaction({
      record,
      budget: repository.budgets.get(ids.budget)!,
      expectedBudgetVersion: 3,
    }).TransactItems!;
    expect(writes).toHaveLength(2);
    expect(writes[0]).toMatchObject({ Put: { ConditionExpression: 'attribute_not_exists(PK)' } });
    expect(writes[1]).toMatchObject({ Put: { ExpressionAttributeValues: { ':expected': 3 } } });
    expect(
      await reconcileFinanceBudget(
        repository,
        actor,
        ids.budget,
        {
          id: ids.reconciliation,
          expectedVersion: 3,
        },
        'reconcile',
        new Date('2027-09-30T23:00:00.000Z'),
      ),
    ).toBe(record);
    expect(listBudgetReconciliationHistory(repository, actor, ids.budget)).toEqual([record]);
  });

  it('rejects incomplete, invalid, refreshing, and concurrently changed sources without partial history', async () => {
    const incomplete = await setup();
    incomplete.accounts.get(ids.account)!.status = 'archived';
    await expect(
      reconcileFinanceBudget(
        incomplete,
        actor,
        ids.budget,
        {
          id: ids.reconciliation,
          expectedVersion: 3,
        },
        'incomplete',
      ),
    ).rejects.toThrow(/complete authorized view/i);

    const invalid = await setup();
    invalid.transactions[0] = { ...invalid.transactions[0]!, reviewState: 'allocation-review' };
    await expect(
      reconcileFinanceBudget(
        invalid,
        actor,
        ids.budget,
        {
          id: ids.reconciliation,
          expectedVersion: 3,
        },
        'invalid',
      ),
    ).rejects.toThrow(/allocation/i);

    const refreshing = await setup();
    refreshing.accounts.get(ids.account)!.connectionId = 'connection-1';
    refreshing.importJobs.set('job-1', {
      id: 'job-1',
      connectionId: 'connection-1',
      status: 'running',
      counts: { accounts: 0, inserted: 0, updated: 0, duplicateSuppressed: 0, reviewIssues: 0 },
      errors: [],
      attempts: 1,
    });
    await expect(
      reconcileFinanceBudget(
        refreshing,
        actor,
        ids.budget,
        {
          id: ids.reconciliation,
          expectedVersion: 3,
        },
        'refreshing',
      ),
    ).rejects.toThrow(/refresh/i);

    const concurrent = await setup();
    const pending = reconcileFinanceBudget(
      concurrent,
      actor,
      ids.budget,
      {
        id: ids.reconciliation,
        expectedVersion: 3,
      },
      'concurrent',
    );
    concurrent.budgets.set(ids.budget, { ...concurrent.budgets.get(ids.budget)!, version: 4 });
    await expect(pending).rejects.toThrow(/version conflict/i);
    expect(concurrent.budgetReconciliations).toHaveLength(0);
  });

  it('marks later total-affecting source changes without rewriting history', async () => {
    const repository = await setup();
    const record = await reconcileFinanceBudget(
      repository,
      actor,
      ids.budget,
      {
        id: ids.reconciliation,
        expectedVersion: 3,
      },
      'reconcile',
      new Date('2027-09-30T23:00:00.000Z'),
    );
    await updateManualTransaction(
      repository,
      actor,
      ids.transaction,
      {
        expectedVersion: repository.transactions[0]!.version,
        amountMinor: -4_700,
      },
      'correct-transaction',
    );
    expect(getFinanceBudget(repository, actor, ids.budget)).toMatchObject({
      status: 'changed-since-reconciliation',
      lastReconciledAt: record.reconciledAt,
    });
    expect(listBudgetReconciliationHistory(repository, actor, ids.budget)).toEqual([record]);
  });
});
