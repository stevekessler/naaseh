import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  replaceTransactionAllocations,
} from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  addFinanceBudgetItem,
  createFinanceBudget,
  getFinanceBudget,
  linkFinanceBudgetAccount,
} from '../../apps/api/src/finance/budget-service.js';

const groupId = '01J00000000000000000000401';
const budgetId = '01J00000000000000000000402';
const groupAccountId = '01J00000000000000000000403';
const privateAccountId = '01J00000000000000000000404';
const owner = {
  id: 'member-a',
  role: 'user' as const,
  active: true,
  groupMemberships: [{ groupId, role: 'member' as const }],
};
const otherMember = {
  id: 'member-b',
  role: 'user' as const,
  active: true,
  groupMemberships: [{ groupId, role: 'member' as const }],
};

async function setup() {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    groupAccountId,
    createFinancialAccount({
      id: groupAccountId,
      scope: { type: 'group', groupId },
      sourceName: 'Shared checking',
      organizationName: 'Fixture Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-04-01T00:00:00.000Z',
    }),
  );
  repository.accounts.set(
    privateAccountId,
    createFinancialAccount({
      id: privateAccountId,
      scope: { type: 'owner', ownerId: owner.id },
      sourceName: 'Private checking',
      organizationName: 'Private Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-04-01T00:00:00.000Z',
    }),
  );
  await createFinanceBudget(
    repository,
    owner,
    {
      id: budgetId,
      groupId,
      name: 'April plan',
      budgetDate: '2026-04-01',
      startDate: '2026-04-01',
      endDate: '2026-04-30',
    },
    'create',
  );
  await linkFinanceBudgetAccount(
    repository,
    owner,
    budgetId,
    {
      id: '01J00000000000000000000411',
      accountId: groupAccountId,
      expectedBudgetVersion: 1,
    },
    'link-group',
  );
  await linkFinanceBudgetAccount(
    repository,
    owner,
    budgetId,
    {
      id: '01J00000000000000000000412',
      accountId: privateAccountId,
      expectedBudgetVersion: 2,
    },
    'link-private',
  );
  await addFinanceBudgetItem(
    repository,
    owner,
    budgetId,
    {
      id: '01J00000000000000000000413',
      expectedBudgetVersion: 3,
      description: 'Private purchase',
      financeCategoryId: '01J00000000000000000000414',
      plannedAmountMinor: -9_999,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [privateAccountId],
    },
    'item-private',
  );
  repository.transactions.push(
    replaceTransactionAllocations(
      createFinancialTransaction({
        id: '01J00000000000000000000415',
        accountId: privateAccountId,
        origin: 'manual',
        amountMinor: -8_888,
        currency: 'USD',
        transactedAt: '2026-04-10T00:00:00.000Z',
        description: 'Private contribution',
        pending: false,
        connectedAccount: false,
      }),
      [
        {
          id: '01J00000000000000000000416',
          amountMinor: -8_888,
          financeCategoryId: '01J00000000000000000000414',
          budgetItemId: '01J00000000000000000000413',
        },
      ],
      owner.id,
    ),
  );
  return repository;
}

describe('Finance budget aggregate privacy', () => {
  it('shows the owner a complete view but gives another member no private link, item, or amount', async () => {
    const repository = await setup();
    expect(getFinanceBudget(repository, owner, budgetId)).toMatchObject({ totalsComplete: true });

    const view = getFinanceBudget(repository, otherMember, budgetId);
    const serialized = JSON.stringify(view);
    expect(view.totalsComplete).toBe(false);
    expect(view.accountLinks).toHaveLength(1);
    expect(view.items).toEqual([]);
    expect(serialized).not.toContain(privateAccountId);
    expect(serialized).not.toContain('Private Bank');
    expect(serialized).not.toContain('9999');
    expect(serialized).not.toContain('8888');
  });

  it('does not disclose hidden account count or aggregate differences', async () => {
    const repository = await setup();
    const oneHidden = getFinanceBudget(repository, otherMember, budgetId);
    repository.accounts.set(
      '01J00000000000000000000421',
      createFinancialAccount({
        id: '01J00000000000000000000421',
        scope: { type: 'owner', ownerId: owner.id },
        sourceName: 'Second private account',
        organizationName: 'Other Bank',
        accountType: 'savings',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-04-01T00:00:00.000Z',
      }),
    );
    repository.budgetAccountLinks.set('01J00000000000000000000422', {
      id: '01J00000000000000000000422',
      budgetId,
      accountId: '01J00000000000000000000421',
      audience: { type: 'owner', ownerId: owner.id },
      status: 'active',
      createdBy: owner.id,
      version: 1,
    });
    const twoHidden = getFinanceBudget(repository, otherMember, budgetId);
    expect(twoHidden).toEqual(oneHidden);
  });

  it('returns the same generic not-found behavior after membership revocation', async () => {
    const repository = await setup();
    const revoked = { ...otherMember, groupMemberships: [] };
    expect(() => getFinanceBudget(repository, revoked, budgetId)).toThrow(
      'Finance record not found.',
    );
    expect(() => getFinanceBudget(repository, otherMember, '01J00000000000000000000499')).toThrow(
      'Finance record not found.',
    );
  });
});
