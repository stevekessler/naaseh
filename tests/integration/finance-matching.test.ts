import { describe, expect, it } from 'vitest';
import {
  correctFinancialTransaction,
  createFinancialAccount,
  createFinancialTransaction,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import {
  addFinanceBudgetItem,
  createFinanceBudget,
  linkFinanceBudgetAccount,
} from '../../apps/api/src/finance/budget-service.js';
import {
  acceptFinanceTransactionMatch,
  copyReusableItemToBudget,
  createFinanceReusableItem,
  evaluateFinanceTransactionMatches,
  invalidateChangedTransactionMatches,
  listReusableOffers,
  undoFinanceTransactionMatch,
} from '../../apps/api/src/finance/matching-service.js';
import {
  buildFinancePersistenceItems,
  financeKeys,
  FinanceMemoryRepository,
} from '../../apps/api/src/finance/repository.js';

const ids = {
  group: '01J00000000000000000000701',
  budget: '01J00000000000000000000702',
  account: '01J00000000000000000000703',
  category: '01J00000000000000000000704',
  merchant: '01J00000000000000000000705',
  reusable: '01J00000000000000000000706',
  item: '01J00000000000000000000707',
  transaction: '01J00000000000000000000708',
  link: '01J00000000000000000000709',
  match: '01J00000000000000000000710',
};
const actor: FinanceActor = {
  id: 'member-1',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' }],
};

async function setup(amountMinor = -50_000) {
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
    },
    'create-budget',
  );
  await linkFinanceBudgetAccount(
    repository,
    actor,
    ids.budget,
    { id: ids.link, accountId: ids.account, expectedBudgetVersion: 1 },
    'link-account',
  );
  const reusable = await createFinanceReusableItem(
    repository,
    actor,
    {
      id: ids.reusable,
      groupId: ids.group,
      description: 'Mobile service',
      merchantId: ids.merchant,
      financeCategoryId: ids.category,
      plannedAmountMinor: -50_000,
      currency: 'USD',
      relatedAccountIds: [ids.account],
      applicableDate: '2027-09-15',
    },
    'create-reusable',
  );
  repository.transactions.push(
    createFinancialTransaction({
      id: ids.transaction,
      accountId: ids.account,
      origin: 'manual',
      amountMinor,
      currency: 'USD',
      transactedAt: '2027-09-15T12:00:00.000Z',
      description: 'Mobile',
      merchantId: ids.merchant,
      pending: false,
      connectedAccount: false,
    }),
  );
  return { repository, reusable };
}

describe('Finance matching service', () => {
  it('persists reusable sources, occurrence locks, and matches under collision-safe keys', async () => {
    const { reusable } = await setup();
    expect(financeKeys.reusableItem(reusable.id).SK).toBe('CURRENT');
    expect(financeKeys.reusableOccurrence(reusable.id, '2027-09-15', ids.budget).SK).toContain(
      `2027-09-15#${ids.budget}`,
    );
    expect(financeKeys.transactionMatch(ids.transaction, ids.match).SK).toBe(`MATCH#${ids.match}`);
    expect(buildFinancePersistenceItems({ reusableItem: reusable })).toHaveLength(1);
  });

  it('offers and copies each occurrence once while leaving the source independent', async () => {
    const { repository, reusable } = await setup();
    expect(listReusableOffers(repository, actor, ids.budget)).toHaveLength(1);
    const copy = await copyReusableItemToBudget(
      repository,
      actor,
      ids.budget,
      reusable.id,
      '2027-09-15',
      ids.item,
      2,
      'copy-reusable',
    );
    expect(copy).toMatchObject({ sourceReusableItemId: reusable.id, applicableDate: '2027-09-15' });
    copy.plannedAmountMinor = -45_000;
    expect(repository.reusableItems.get(reusable.id)?.plannedAmountMinor).toBe(-50_000);
    expect(listReusableOffers(repository, actor, ids.budget)).toEqual([]);
    await expect(
      copyReusableItemToBudget(
        repository,
        actor,
        ids.budget,
        reusable.id,
        '2027-09-15',
        'another-item',
        3,
        'copy-again',
      ),
    ).rejects.toThrow(/already copied/i);
  });

  it('auto-accepts a unique exact match atomically and supports undo', async () => {
    const { repository, reusable } = await setup();
    await copyReusableItemToBudget(
      repository,
      actor,
      ids.budget,
      reusable.id,
      '2027-09-15',
      ids.item,
      2,
      'copy-reusable',
    );
    const evaluated = await evaluateFinanceTransactionMatches(
      repository,
      actor,
      ids.transaction,
      () => ids.match,
      'evaluate-exact',
    );
    expect(evaluated).toHaveLength(1);
    expect(evaluated[0]).toMatchObject({ status: 'accepted', kind: 'exact' });
    expect(repository.transactions[0]?.allocations[0]).toMatchObject({
      budgetItemId: ids.item,
      amountMinor: -50_000,
    });
    const undone = await undoFinanceTransactionMatch(
      repository,
      actor,
      ids.match,
      1,
      repository.transactions[0]!.version,
      'undo-match',
    );
    expect(undone.status).toBe('undone');
    expect(repository.transactions[0]?.allocations[0]?.budgetItemId).toBeUndefined();
  });

  it('invalidates an accepted match and detaches it when the transaction source changes', async () => {
    const { repository, reusable } = await setup();
    await copyReusableItemToBudget(
      repository,
      actor,
      ids.budget,
      reusable.id,
      '2027-09-15',
      ids.item,
      2,
      'copy-reusable',
    );
    await evaluateFinanceTransactionMatches(
      repository,
      actor,
      ids.transaction,
      () => ids.match,
      'evaluate-exact',
    );
    repository.transactions[0] = correctFinancialTransaction(repository.transactions[0]!, {
      amountMinor: -75_000,
    });

    expect(invalidateChangedTransactionMatches(repository, ids.transaction)).toMatchObject([
      { id: ids.match, status: 'invalidated' },
    ]);
    expect(repository.transactions[0]?.allocations[0]?.budgetItemId).toBeUndefined();
    expect(repository.feedChanges.at(-1)).toMatchObject({
      entityType: 'financeTransactionMatch',
      entityId: ids.match,
    });
  });

  it('keeps near and ambiguous candidates as user-controlled suggestions', async () => {
    const near = await setup(-55_000);
    await copyReusableItemToBudget(
      near.repository,
      actor,
      ids.budget,
      near.reusable.id,
      '2027-09-15',
      ids.item,
      2,
      'copy-near',
    );
    expect(
      await evaluateFinanceTransactionMatches(
        near.repository,
        actor,
        ids.transaction,
        () => ids.match,
        'evaluate-near',
      ),
    ).toMatchObject([{ status: 'suggested', kind: 'near' }]);
    await acceptFinanceTransactionMatch(
      near.repository,
      actor,
      ids.match,
      1,
      near.repository.transactions[0]!.version,
      'accept-near',
    );
    expect(near.repository.transactions[0]?.allocations[0]?.budgetItemId).toBe(ids.item);

    const ambiguous = await setup();
    await addFinanceBudgetItem(
      ambiguous.repository,
      actor,
      ids.budget,
      {
        id: ids.item,
        expectedBudgetVersion: 2,
        description: 'First',
        merchantId: ids.merchant,
        financeCategoryId: ids.category,
        plannedAmountMinor: -50_000,
        currency: 'USD',
        relatedAccountIds: [ids.account],
      },
      'first-item',
    );
    await addFinanceBudgetItem(
      ambiguous.repository,
      actor,
      ids.budget,
      {
        id: `${ids.item}A`,
        expectedBudgetVersion: 3,
        description: 'Second',
        merchantId: ids.merchant,
        financeCategoryId: ids.category,
        plannedAmountMinor: -50_000,
        currency: 'USD',
        relatedAccountIds: [ids.account],
      },
      'second-item',
    );
    const suggestions = await evaluateFinanceTransactionMatches(
      ambiguous.repository,
      actor,
      ids.transaction,
      (() => {
        let index = 0;
        return () => `${ids.match}${++index}`;
      })(),
      'evaluate-ambiguous',
    );
    expect(suggestions).toHaveLength(2);
    expect(suggestions.every(({ status }) => status === 'suggested')).toBe(true);
  });
});
