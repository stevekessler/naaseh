import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import type { DeletionPreview } from '../../apps/api/src/finance/deletion-service.js';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import { recordManualBalance } from '../../apps/api/src/finance/account-service.js';
import { expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  replaceTransactionAllocations,
  createMerchant,
  createTransactionMatch,
} from '@naaseh/domain';
import {
  FinanceMemoryRepository,
  buildFinancePersistenceItems,
} from '../../apps/api/src/finance/repository.js';
import {
  createFinanceBudget,
  linkFinanceBudgetAccount,
  addFinanceBudgetItem,
  getFinanceBudget,
} from '../../apps/api/src/finance/budget-service.js';
import {
  reconcileFinanceBudget,
  listBudgetReconciliationHistory,
} from '../../apps/api/src/finance/reconciliation-service.js';
import {
  FinanceRouteRegistry,
  registerUserStory1FinanceRoutes,
} from '../../apps/api/src/finance/handlers.js';
import {
  createManualTransaction,
  replaceTransactionAllocationsForActor,
  associateTransactionMerchant,
} from '../../apps/api/src/finance/transaction-service.js';
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
const owner = {
  id: 'owner',
  role: 'user' as const,
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'owner' as const }],
};
const member = {
  id: 'member',
  role: 'user' as const,
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' as const }],
};
async function setup() {
  const r = new FinanceMemoryRepository();
  r.accounts.set(
    ids.account,
    createFinancialAccount({
      id: ids.account,
      scope: { type: 'owner', ownerId: owner.id },
      sourceName: 'Private',
      organizationName: 'Private bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-04-01T00:00:00.000Z',
    }),
  );
  await createFinanceBudget(
    r,
    owner,
    {
      id: ids.budget,
      groupId: ids.group,
      name: 'Shared',
      budgetDate: '2026-04-01',
      startDate: '2026-04-01',
      status: 'active',
    },
    'budget',
  );
  await linkFinanceBudgetAccount(
    r,
    owner,
    ids.budget,
    { id: ids.link, accountId: ids.account, expectedBudgetVersion: 1 },
    'link',
  );
  await addFinanceBudgetItem(
    r,
    owner,
    ids.budget,
    {
      id: ids.item,
      description: 'Private medical expense',
      financeCategoryId: ids.category,
      plannedAmountMinor: -12345,
      currency: 'USD',
      relatedAccountIds: [ids.account],
      expectedBudgetVersion: 2,
    },
    'item',
  );
  const t = createFinancialTransaction({
    id: ids.transaction,
    accountId: ids.account,
    origin: 'manual',
    amountMinor: -12345,
    currency: 'USD',
    transactedAt: '2026-04-02T00:00:00.000Z',
    description: 'Private',
    pending: false,
    connectedAccount: false,
  });
  r.transactions.push(
    replaceTransactionAllocations(
      t,
      [
        {
          id: ids.allocation,
          amountMinor: -12345,
          financeCategoryId: ids.category,
          budgetItemId: ids.item,
        },
      ],
      owner.id,
    ),
  );
  return r;
}
it.each(['active', 'archived', 'unlinked', 'missing-account', 'legacy'] as const)(
  'protects private reconciliation history: %s',
  async (state) => {
    const r = await setup();
    const record = await reconcileFinanceBudget(
      r,
      owner,
      ids.budget,
      { id: 'recon', expectedVersion: 3 },
      'recon',
    );
    expect(getFinanceBudget(r, owner, ids.budget).reconciliations).toEqual([record]);
    expect(record).not.toHaveProperty('sourceAccountIds');
    const stored = r.budgetReconciliations[0]!;
    expect(buildFinancePersistenceItems({ reconciliation: stored })[0]).toMatchObject({
      Put: { Item: { data: { sourceAccountIds: [ids.account] } } },
    });
    if (state === 'archived')
      r.budgets.set(ids.budget, { ...r.budgets.get(ids.budget)!, status: 'archived' });
    if (state === 'unlinked')
      r.budgetAccountLinks.set(ids.link, {
        ...r.budgetAccountLinks.get(ids.link)!,
        status: 'removed',
      });
    if (state === 'missing-account') r.accounts.delete(ids.account);
    if (state === 'legacy') r.budgetReconciliations[0] = record;
    const view = getFinanceBudget(r, member, ids.budget);
    expect(view.reconciliations).toEqual([]);
    expect(JSON.stringify(view)).not.toContain('12345');
    expect(listBudgetReconciliationHistory(r, member, ids.budget)).toEqual([]);
    const feed = r.feedChanges.find((c) => c.entityType === 'financeReconciliation')!;
    expect(feed.audience).toBe('GROUP#' + ids.group);
    expect(feed.payload).toMatchObject({ totalsByCurrency: [], totalsByCategory: [] });
    expect(feed.payload).not.toHaveProperty('sourceAccountIds');
    expect(JSON.stringify(feed)).not.toContain('12345');
  },
);

it.each(['private', 'mixed', 'group'] as const)('protects budget-item feed: %s', async (scope) => {
  const r = await setup();
  r.feedChanges.length = 0;
  if (scope === 'group')
    r.accounts.set(ids.account, {
      ...r.accounts.get(ids.account)!,
      scope: { type: 'group', groupId: ids.group },
    });
  const accountIds = [ids.account];
  if (scope === 'mixed') {
    r.accounts.set('shared', {
      ...r.accounts.get(ids.account)!,
      id: 'shared',
      scope: { type: 'group', groupId: ids.group },
    });
    await linkFinanceBudgetAccount(
      r,
      owner,
      ids.budget,
      { id: 'shared-link', accountId: 'shared', expectedBudgetVersion: 3 },
      'shared-link',
    );
    accountIds.push('shared');
  }
  await addFinanceBudgetItem(
    r,
    owner,
    ids.budget,
    {
      id: 'another-item',
      description: 'Sensitive purchase',
      financeCategoryId: ids.category,
      plannedAmountMinor: -45678,
      currency: 'USD',
      relatedAccountIds: accountIds,
      expectedBudgetVersion: r.budgets.get(ids.budget)!.version,
    },
    'another-item',
  );
  const change = r.feedChanges.find((c) => c.entityType === 'financeBudgetItem')!;
  expect(change.audience).toBe('GROUP#' + ids.group);
  if (scope === 'group') {
    expect(change.operation).toBe('upsert');
    expect(change.payload).toMatchObject({
      relatedAccountIds: [ids.account],
      plannedAmountMinor: -45678,
    });
    expect(getFinanceBudget(r, member, ids.budget).items).toHaveLength(2);
  } else {
    expect(change.operation).toBe('tombstone');
    expect(change).not.toHaveProperty('payload');
    expect(JSON.stringify(change)).not.toMatch(/45678|Sensitive purchase/);
    expect(JSON.stringify(change)).not.toContain(ids.account);
    expect(getFinanceBudget(r, member, ids.budget).items).toHaveLength(0);
    expect(getFinanceBudget(r, owner, ids.budget).items).toHaveLength(2);
  }
});

const deletionSetup = () => {
  const r = new FinanceMemoryRepository();
  r.accounts.set(
    ids.account,
    createFinancialAccount({
      id: ids.account,
      scope: { type: 'owner', ownerId: owner.id },
      sourceName: 'Manual',
      organizationName: 'Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-04-01T00:00:00.000Z',
    }),
  );
  const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
    repository: r,
    actorFor: () => owner,
    deletionSigningSecret: 'test',
    allowedSimplefinHosts: [],
    now: () => new Date('2026-04-01T00:00:00.000Z'),
  });
  const handler = createFinanceHandler(registry);
  const request = (method: string, recordType: string, recordId: string, body?: unknown) =>
    ({
      routeKey: `${method} /api/v1/finance/records/{recordType}/{recordId}/${method === 'GET' ? 'deletion-preview' : 'deletion'}`,
      headers: {
        origin: 'http://localhost:4173',
        'x-csrf-token': 'csrf',
        'idempotency-key': 'delete',
      },
      requestContext: {
        requestId: 'audit',
        http: { method },
        authorizer: { lambda: { userId: owner.id, csrfToken: 'csrf' } },
      },
      pathParameters: { recordType, recordId },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }) as APIGatewayProxyEventV2;
  return {
    r,
    preview: async (type: string, id: string) => {
      const result = (await handler(request('GET', type, id))) as {
        statusCode: number;
        body: string;
      };
      expect(result.statusCode).toBe(200);
      return JSON.parse(result.body) as DeletionPreview;
    },
    confirm: async (preview: DeletionPreview) =>
      handler(
        request('POST', preview.recordType, preview.recordId, {
          expectedVersion: preview.expectedVersion,
          confirmationToken: preview.confirmationToken,
        }),
      ),
  };
};
it.each([
  'transaction-newer',
  'transaction-backdated',
  'balance',
  'budget-link',
  'untouched',
] as const)('revalidates account deletion: %s', async (change) => {
  const { r, preview, confirm } = deletionSetup();
  const p = await preview('account', ids.account);
  expect(p.outcome).toBe('permanent-delete');
  if (change.startsWith('transaction'))
    await createManualTransaction(
      r,
      owner,
      ids.account,
      {
        id: ids.transaction,
        amountMinor: 100,
        transactedAt:
          change === 'transaction-newer' ? '2026-04-02T00:00:00.000Z' : '2026-03-01T00:00:00.000Z',
        description: 'New transaction',
      },
      'new',
    );
  if (change === 'balance')
    await recordManualBalance(
      r,
      owner,
      ids.account,
      {
        id: 'balance',
        expectedAccountVersion: 1,
        balanceMinor: 100,
        effectiveAt: '2026-04-02T00:00:00.000Z',
        recordedAt: '2026-04-02T00:00:00.000Z',
      },
      'balance',
    );
  if (change === 'budget-link') {
    await createFinanceBudget(
      r,
      owner,
      {
        id: ids.budget,
        groupId: ids.group,
        name: 'Shared',
        budgetDate: '2026-04-01',
        startDate: '2026-04-01',
      },
      'budget',
    );
    await linkFinanceBudgetAccount(
      r,
      owner,
      ids.budget,
      { id: ids.link, accountId: ids.account, expectedBudgetVersion: 1 },
      'link',
    );
  }
  const response = (await confirm(p)) as { statusCode: number };
  expect(response.statusCode).toBe(change === 'untouched' ? 200 : 409);
  expect(r.accounts.has(ids.account)).toBe(change !== 'untouched');
  if (change !== 'untouched') {
    expect(r.deletionPreviews.has(p.confirmationToken)).toBe(true);
    const fresh = await preview('account', ids.account);
    expect(fresh.outcome).toBe('archive');
  }
});
it.each(['allocation', 'merchant', 'match', 'untouched'] as const)(
  'revalidates transaction deletion: %s',
  async (change) => {
    const { r, preview, confirm } = deletionSetup();
    await createManualTransaction(
      r,
      owner,
      ids.account,
      {
        id: ids.transaction,
        amountMinor: 100,
        transactedAt: '2026-04-02T00:00:00.000Z',
        description: 'New',
      },
      'new',
    );
    const p = await preview('transaction', ids.transaction);
    expect(p.outcome).toBe('permanent-delete');
    if (change === 'allocation')
      await replaceTransactionAllocationsForActor(
        r,
        owner,
        ids.transaction,
        {
          expectedVersion: 1,
          allocations: [{ id: ids.allocation, financeCategoryId: ids.category, amountMinor: 100 }],
        },
        'allocation',
      );
    if (change === 'merchant') {
      const m = createMerchant({
        id: 'merchant',
        name: 'Shop',
        source: 'manual',
        creatorId: owner.id,
      });
      r.merchants.set(m.id, m);
      await associateTransactionMerchant(r, owner, ids.transaction, m.id, 1, 'merchant');
    }
    if (change === 'match')
      r.transactionMatches.set(
        'match',
        createTransactionMatch({
          id: 'match',
          transactionId: ids.transaction,
          budgetItemId: ids.item,
          kind: 'near',
          scoreBasis: { merchant: false, date: false, account: true, amountDifferencePercent: 0 },
        }),
      );
    const response = (await confirm(p)) as { statusCode: number };
    expect(response.statusCode).toBe(change === 'untouched' ? 200 : 409);
    expect(r.transactions).toHaveLength(change === 'untouched' ? 0 : 1);
  },
);
it('reauthorizes reconciliation receipt replay after account access is revoked', async () => {
  const r = await setup();
  await reconcileFinanceBudget(r, owner, ids.budget, { id: 'recon', expectedVersion: 3 }, 'recon');
  r.accounts.set(ids.account, {
    ...r.accounts.get(ids.account)!,
    scope: { type: 'owner', ownerId: 'someone-else' },
  });
  await expect(
    reconcileFinanceBudget(r, owner, ids.budget, { id: 'recon', expectedVersion: 3 }, 'recon'),
  ).rejects.toThrow('Finance record not found.');
});
