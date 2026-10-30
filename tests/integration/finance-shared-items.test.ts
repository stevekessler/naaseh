import { beforeEach, expect, it, vi } from 'vitest';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  createFinanceHandler,
  createDefaultFinanceRegistry,
} from '../../apps/api/src/finance/handler.js';
import { DynamoFinanceRepository } from '../../apps/api/src/finance/durable-repository.js';
import { FinanceDynamoFixture } from '../fixtures/finance/dynamo.js';
import {
  createUlid,
  createFinancialAccount,
  createFinancialTransaction,
  createTransactionMatch,
  parseSimplefinV2,
} from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  createFinanceBudget,
  linkFinanceBudgetAccount,
  addFinanceBudgetItem,
  linkSharedFinanceBudgetItem,
  updateSharedFinanceBudgetItem,
  getFinanceBudget,
} from '../../apps/api/src/finance/budget-service.js';
import { replaceTransactionAllocationsForActor } from '../../apps/api/src/finance/transaction-service.js';
import { acceptFinanceTransactionMatch } from '../../apps/api/src/finance/matching-service.js';
import { manualFinanceAccountInputSchema } from '@naaseh/contracts';
import { simplefinV2Fixture } from '../fixtures/finance/simplefin.js';
let repository: FinanceMemoryRepository;
const group = createUlid(),
  first = createUlid(),
  second = createUlid(),
  account = createUlid(),
  item = createUlid(),
  category = createUlid(),
  transaction = createUlid();
const actor = {
  id: 'owner',
  active: true,
  role: 'user' as const,
  groupMemberships: [{ groupId: group, role: 'owner' as const }],
};
const itemInput = {
  id: item,
  description: 'Shared utilities',
  financeCategoryId: category,
  plannedAmountMinor: -100,
  currency: 'USD',
  relatedAccountIds: [account],
  expectedBudgetVersion: 2,
};
const allocation = (budgetId?: string, amountMinor = -100) => ({
  id: createUlid(),
  amountMinor,
  financeCategoryId: category,
  budgetItemId: item,
  ...(budgetId ? { budgetId } : {}),
});
beforeEach(async () => {
  repository = new FinanceMemoryRepository();
  repository.accounts.set(
    account,
    createFinancialAccount({
      id: account,
      scope: { type: 'group', groupId: group },
      sourceName: 'Checking',
      organizationName: 'Bank',
      accountType: 'checking',
      openingBalanceMinor: 0,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  for (const id of [first, second]) {
    await createFinanceBudget(
      repository,
      actor,
      { id, groupId: group, name: id, budgetDate: '2026-01-01', startDate: '2026-01-01' },
      createUlid(),
    );
    await linkFinanceBudgetAccount(
      repository,
      actor,
      id,
      { id: createUlid(), accountId: account, expectedBudgetVersion: 1 },
      createUlid(),
    );
  }
  await addFinanceBudgetItem(repository, actor, first, itemInput, createUlid());
  repository.transactions.push(
    createFinancialTransaction({
      id: transaction,
      accountId: account,
      origin: 'manual',
      currency: 'USD',
      amountMinor: -100,
      transactedAt: '2026-01-02T00:00:00.000Z',
      description: 'Utilities',
      pending: false,
      connectedAccount: false,
    }),
  );
});
const share = () => linkSharedFinanceBudgetItem(repository, actor, second, item, 2, createUlid());
it('links one canonical item to two budgets without replacing its definition', async () => {
  await share();
  expect(repository.budgetItems.size).toBe(1);
  expect(getFinanceBudget(repository, actor, first).items[0]?.id).toBe(item);
  expect(getFinanceBudget(repository, actor, second).items[0]?.id).toBe(item);
  const handler = createFinanceHandler(createDefaultFinanceRegistry(repository, actor));
  const request = (method: string, path: string, body?: unknown) =>
    ({
      version: '2.0',
      rawPath: path,
      routeKey: `${method} /api/v1/finance/{proxy+}`,
      headers: {
        origin: 'http://localhost:4173',
        'x-csrf-token': 'csrf',
        'idempotency-key': createUlid(),
      },
      requestContext: {
        requestId: 'test',
        http: { method },
        authorizer: { lambda: { userId: actor.id, csrfToken: 'csrf' } },
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }) as APIGatewayProxyEventV2;
  const previewResponse = (await handler(
    request('GET', `/api/v1/finance/records/budget/${first}/deletion-preview`),
  )) as { statusCode: number; body: string };
  expect(previewResponse.statusCode).toBe(200);
  const preview = JSON.parse(previewResponse.body);
  const archived = (await handler(
    request('POST', `/api/v1/finance/records/budget/${first}/deletion`, {
      expectedVersion: preview.expectedVersion,
      confirmationToken: preview.confirmationToken,
    }),
  )) as { statusCode: number };
  expect(archived.statusCode).toBe(200);
  expect(repository.budgetItems.get(item)?.status).toBe('active');
  expect(getFinanceBudget(repository, actor, second).items[0]?.id).toBe(item);
  const fixture = new FinanceDynamoFixture();
  const send = vi
    .spyOn(DynamoDBDocumentClient.prototype, 'send')
    .mockImplementation(fixture.send as never);
  try {
    const store = new DynamoFinanceRepository(fixture.client());
    const session = await store.load();
    for (const [name, value] of Object.entries(repository)) {
      const target = (session.repository as unknown as Record<string, unknown>)[name];
      if (value instanceof Map && target instanceof Map)
        for (const [key, record] of value) target.set(key, record);
      else if (Array.isArray(value) && Array.isArray(target)) target.push(...value);
    }
    await session.commit();
    const fresh = await new DynamoFinanceRepository(fixture.client()).load();
    expect(fresh.repository.budgetItems.size).toBe(1);
    expect(getFinanceBudget(fresh.repository, actor, second).items[0]?.id).toBe(item);
  } finally {
    send.mockRestore();
  }
});
it('edits the shared definition and advances every linked budget', async () => {
  await share();
  await updateSharedFinanceBudgetItem(
    repository,
    actor,
    item,
    { expectedVersion: 1, description: 'Changed everywhere', plannedAmountMinor: -200 },
    createUlid(),
  );
  for (const id of [first, second]) {
    expect(getFinanceBudget(repository, actor, id).items[0]?.description).toBe(
      'Changed everywhere',
    );
    expect(repository.budgets.get(id)?.version).toBe(4);
  }
});
it('rejects a create using an existing shared item identifier', async () => {
  await expect(
    addFinanceBudgetItem(
      repository,
      actor,
      second,
      { ...itemInput, description: 'Overwrite' },
      createUlid(),
    ),
  ).rejects.toThrow('already exists');
  expect(repository.budgetItems.get(item)?.description).toBe('Shared utilities');
});
it('requires original-item access before linking a known identifier', async () => {
  const outsider = { ...actor, id: 'outsider', groupMemberships: [] };
  await expect(
    linkSharedFinanceBudgetItem(repository, outsider, second, item, 2, createUlid()),
  ).rejects.toThrow('not found');
});
it('requires access to every budget before editing a shared definition', async () => {
  await share();
  const budget = repository.budgets.get(second)!;
  repository.budgets.set(second, { ...budget, groupId: 'revoked-group' });
  await expect(
    updateSharedFinanceBudgetItem(
      repository,
      actor,
      item,
      { expectedVersion: 1, description: 'No', plannedAmountMinor: -1 },
      createUlid(),
    ),
  ).rejects.toThrow('not found');
  expect(repository.budgetItems.get(item)?.version).toBe(1);
});
it('requires a specific budget when allocating to a shared item', async () => {
  await share();
  await expect(
    replaceTransactionAllocationsForActor(
      repository,
      actor,
      transaction,
      { expectedVersion: 1, allocations: [allocation()] },
      createUlid(),
    ),
  ).rejects.toThrow('Choose one budget');
});
it('rejects splitting one transaction between two budgets', async () => {
  await share();
  await expect(
    replaceTransactionAllocationsForActor(
      repository,
      actor,
      transaction,
      { expectedVersion: 1, allocations: [allocation(first, -50), allocation(second, -50)] },
      createUlid(),
    ),
  ).rejects.toThrow('only one budget');
  expect(repository.transactions[0]?.version).toBe(1);
});
it('counts a linked transaction in only its selected budget', async () => {
  await share();
  await replaceTransactionAllocationsForActor(
    repository,
    actor,
    transaction,
    { expectedVersion: 1, allocations: [allocation(second)] },
    createUlid(),
  );
  expect(getFinanceBudget(repository, actor, first).totals[0]?.actualMinor).toBe(0);
  expect(getFinanceBudget(repository, actor, second).totals[0]?.actualMinor).toBe(-100);
});
it('keeps legacy transaction allocations in their original budget after sharing', async () => {
  repository.transactions[0]!.allocations = [
    {
      ...allocation(),
      createdBy: actor.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  await share();
  expect(getFinanceBudget(repository, actor, first).totals[0]?.actualMinor).toBe(-100);
  expect(getFinanceBudget(repository, actor, second).totals[0]?.actualMinor).toBe(0);
});
it('does not accept a second-budget match while a transaction is linked elsewhere', async () => {
  await share();
  await replaceTransactionAllocationsForActor(
    repository,
    actor,
    transaction,
    { expectedVersion: 1, allocations: [allocation(first)] },
    createUlid(),
  );
  const match = createTransactionMatch({
    id: createUlid(),
    transactionId: transaction,
    budgetItemId: item,
    budgetId: second,
    kind: 'manual',
    scoreBasis: { merchant: false, date: true, account: true, amountDifferencePercent: 0 },
  });
  repository.transactionMatches.set(match.id, match);
  await expect(
    acceptFinanceTransactionMatch(repository, actor, match.id, 1, 2, createUlid()),
  ).rejects.toThrow('only one budget');
});
it('defaults manual account input to USD while retaining an explicit currency', () => {
  const input = {
    scope: { type: 'owner', ownerId: createUlid() },
    sourceName: 'Checking',
    organizationName: 'Bank',
    accountType: 'checking',
    openingBalanceMinor: 0,
    balanceAt: '2026-01-01T00:00:00.000Z',
  };
  expect(manualFinanceAccountInputSchema.parse(input).currency).toBe('USD');
  expect(manualFinanceAccountInputSchema.parse({ ...input, currency: 'EUR' }).currency).toBe('EUR');
  expect(repository.accounts.get(account)?.currency).toBe('USD');
});
it('defaults provider accounts without a currency to USD', () => {
  const payload = structuredClone(simplefinV2Fixture) as unknown as {
    accounts: Array<Record<string, unknown>>;
  };
  delete payload.accounts[0]!.currency;
  expect(parseSimplefinV2(payload).accounts[0]?.currency).toBe('USD');
});
