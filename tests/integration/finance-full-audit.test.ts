import { expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  createFinancialAccount,
  createFinancialTransaction,
  createImportJob,
  deriveCurrentBalance,
  parseSimplefinV2,
} from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  FinanceRouteRegistry,
  registerUserStory1FinanceRoutes,
} from '../../apps/api/src/finance/handlers.js';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import {
  createManualAccount,
  recordManualBalance,
  completeSimplefinAccountIdentity,
} from '../../apps/api/src/finance/account-service.js';
import {
  createManualTransaction,
  updateManualTransaction,
  replaceTransactionAllocationsForActor,
  searchAuthorizedTransactions,
} from '../../apps/api/src/finance/transaction-service.js';
import { commitCsvImportChunk } from '../../apps/api/src/finance/csv-import-service.js';
import {
  acquireRefreshLease,
  boundedRefreshWindow,
  importSimplefinAccounts,
} from '../../apps/api/src/finance/connection-service.js';
import { executeFinanceImport } from '../../apps/api/src/finance/import-handler.js';
import { fetchSimplefinAccounts } from '../../apps/api/src/finance/simplefin-client.js';
import { evaluateFinanceTransactionMatches } from '../../apps/api/src/finance/matching-service.js';
import { createTaskFromFinanceBudgetItem } from '../../apps/api/src/finance/task-link-service.js';
import { simplefinV2Fixture } from '../fixtures/finance/simplefin.js';
const actor = {
  id: 'user',
  role: 'user' as const,
  active: true,
  groupMemberships: [{ groupId: 'group', role: 'member' as const }],
};
const input = {
  id: '01J00000000000000000000303',
  scope: { type: 'owner' as const, ownerId: actor.id },
  sourceName: 'Checking',
  organizationName: 'Bank',
  accountType: 'checking' as const,
  currency: 'USD',
  openingBalanceMinor: 1000,
  balanceAt: '2026-01-10T00:00:00.000Z',
};
const before = '2026-01-09T00:00:00.000Z',
  after = '2026-01-11T00:00:00.000Z';
async function setup() {
  const r = new FinanceMemoryRepository();
  await createManualAccount(r, actor, input, 'account');
  return r;
}
const txn = (id = 'txn') => ({
  id,
  amountMinor: -100,
  transactedAt: after,
  description: 'Purchase',
});
const request = (method: string, path: string, body?: unknown) =>
  ({
    routeKey: `${method} /api/v1/finance/{proxy+}`,
    rawPath: path,
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'csrf',
      'idempotency-key': 'request',
    },
    requestContext: {
      requestId: 'test',
      http: { method },
      authorizer: { lambda: { userId: actor.id, csrfToken: 'csrf' } },
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as APIGatewayProxyEventV2;
const handler = (r: FinanceMemoryRepository) =>
  createFinanceHandler(
    registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository: r,
      actorFor: () => actor,
      deletionSigningSecret: 'test',
      allowedSimplefinHosts: [],
    }),
  );
const csv = (overrides: Record<string, unknown> = {}) => ({
  accountId: input.id,
  batchId: 'batch',
  fileDigest: 'a'.repeat(64),
  duplicateDecisionDigest: 'b'.repeat(64),
  duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
  chunkIndex: 0,
  finalChunk: true,
  rows: [{ ordinal: 1, amountMinor: -100, transactedAt: after, description: 'Purchase' }],
  ...overrides,
});

it('resolves real API Gateway proxy route keys', async () => {
  const r = await setup();
  expect(
    ((await handler(r)(request('GET', '/api/v1/finance/accounts'))) as { statusCode: number })
      .statusCode,
  ).toBe(200);
});
it('extracts and decodes proxy path parameters', async () => {
  const r = await setup();
  const response = (await handler(r)(
    request('GET', `/api/v1/finance/accounts/${encodeURIComponent(input.id)}`),
  )) as { statusCode: number; body: string };
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body).id).toBe(input.id);
});
it('accepts API Gateway base64 request bodies', async () => {
  const r = await setup();
  const event = request('POST', `/api/v1/finance/accounts/${input.id}/transactions`, {
    amountMinor: -100,
    transactedAt: after,
    description: 'Purchase',
  });
  event.body = Buffer.from(event.body!).toString('base64');
  event.isBase64Encoded = true;
  expect(((await handler(r)(event)) as { statusCode: number }).statusCode).toBe(201);
});
it('rejects oversized bodies before route execution', async () => {
  const r = await setup();
  const event = request('POST', '/api/v1/finance/accounts');
  event.body = 'x'.repeat(1000001);
  expect(((await handler(r)(event)) as { statusCode: number }).statusCode).toBe(413);
  expect(r.accounts.size).toBe(1);
});
it('cancels an oversized streaming provider body without buffering the rest', async () => {
  const cancel = vi.fn();
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++;
      controller.enqueue(new Uint8Array(8));
    },
    cancel,
  });
  await expect(
    fetchSimplefinAccounts(
      'https://user:pass@bridge.simplefin.org/x',
      ['bridge.simplefin.org'],
      async () => new Response(body),
      10,
    ),
  ).rejects.toThrow(/size/);
  expect(cancel).toHaveBeenCalledOnce();
  expect(pulls).toBeLessThan(5);
});
it.each([true, false])(
  'recalculates a correction across the balance baseline: wasLater=%s',
  async (wasLater) => {
    const r = await setup();
    await createManualTransaction(
      r,
      actor,
      input.id,
      { ...txn(), transactedAt: wasLater ? after : before },
      'create',
    );
    await updateManualTransaction(
      r,
      actor,
      'txn',
      { expectedVersion: 1, transactedAt: wasLater ? before : after },
      'correct',
    );
    expect(r.accounts.get(input.id)!.currentBalanceMinor).toBe(wasLater ? 1000 : 900);
  },
);
it('keeps provider balance authoritative for provisional manual entries', async () => {
  const r = await setup();
  r.accounts.set(input.id, { ...r.accounts.get(input.id)!, connectionId: 'bridge' });
  await createManualTransaction(r, actor, input.id, txn(), 'create');
  expect(r.accounts.get(input.id)!.currentBalanceMinor).toBe(1000);
});
it('keeps the newest balance date when inserting an older snapshot', async () => {
  const r = await setup();
  await recordManualBalance(
    r,
    actor,
    input.id,
    {
      id: 'old',
      expectedAccountVersion: 1,
      balanceMinor: 200,
      effectiveAt: before,
      recordedAt: after,
    },
    'balance',
  );
  expect(r.accounts.get(input.id)).toMatchObject({
    balanceAt: input.balanceAt,
    currentBalanceMinor: 1000,
  });
});
it('excludes archived transactions from derived balances', () => {
  expect(
    deriveCurrentBalance(
      [
        {
          id: 'snapshot',
          accountId: input.id,
          balanceMinor: 1000,
          currency: 'USD',
          currencyExponent: 2,
          effectiveAt: input.balanceAt,
          recordedAt: input.balanceAt,
          source: 'manual',
        },
      ],
      [{ amountMinor: -100, effectiveAt: after, status: 'archived' }],
    ),
  ).toBe(1000);
});
it('rejects changed content under an already committed CSV chunk', async () => {
  const r = await setup();
  await commitCsvImportChunk(r, csv());
  await expect(
    commitCsvImportChunk(
      r,
      csv({
        rows: [{ ordinal: 1, amountMinor: -200, transactedAt: after, description: 'Changed' }],
      }),
    ),
  ).rejects.toThrow(/conflict/);
  expect(r.transactions).toHaveLength(1);
});
it('does not poison file replay receipts when duplicate review is rejected', async () => {
  const r = await setup();
  await createManualTransaction(r, actor, input.id, txn(), 'create');
  await expect(commitCsvImportChunk(r, csv())).rejects.toThrow(/review/);
  expect(r.csvFileReceipts.size).toBe(0);
});
it('does not finalize an out-of-order CSV import before all chunks arrive', async () => {
  const r = await setup();
  expect(await commitCsvImportChunk(r, csv({ chunkIndex: 1, rows: [] }))).toMatchObject({
    status: 'committing',
  });
  expect(await commitCsvImportChunk(r, csv({ finalChunk: false }))).toMatchObject({
    status: 'succeeded',
  });
});
it('records malformed CSV dates as recoverable failed rows', async () => {
  const r = await setup();
  expect(
    await commitCsvImportChunk(
      r,
      csv({
        rows: [{ ordinal: 1, amountMinor: -100, transactedAt: 'invalid', description: 'Bad date' }],
      }),
    ),
  ).toMatchObject({ status: 'partial', failedOrdinals: [1] });
  expect(r.transactions).toHaveLength(0);
});
it('advances refresh overlap from the last successful run', () => {
  expect(
    boundedRefreshWindow(
      { lastSuccessfulAt: '2026-02-20T00:00:00.000Z', lastSuccessfulStartDate: '2025-12-01' },
      new Date('2026-02-22T00:00:00.000Z'),
    ).startDate,
  ).toBe('2026-02-15');
});
it('rejects import jobs bound to a different connection', () => {
  const r = new FinanceMemoryRepository();
  r.importJobs.set('job', createImportJob('job', 'a'));
  expect(() => acquireRefreshLease(r, 'b', 'job')).toThrow(/not found/);
});
it('recovers an expired worker lease without concurrent execution', () => {
  const r = new FinanceMemoryRepository();
  acquireRefreshLease(r, 'a', 'job', new Date('2026-01-01T00:00:00Z'));
  expect(() => acquireRefreshLease(r, 'a', 'job', new Date('2026-01-01T00:01:00Z'))).toThrow(
    /lease/,
  );
  expect(acquireRefreshLease(r, 'a', 'job', new Date('2026-01-01T00:06:00Z')).leaseUntil).toBe(
    '2026-01-01T00:11:00.000Z',
  );
});
it('treats completed asynchronous import delivery as an idempotent replay', async () => {
  const r = new FinanceMemoryRepository();
  r.connections.set('a', { status: 'active' });
  const job = { ...createImportJob('job', 'a'), status: 'succeeded' as const };
  r.importJobs.set('job', job);
  const fetcher = vi.fn();
  expect(
    await executeFinanceImport(
      { connectionId: 'a', jobId: 'job' },
      { repository: r, allowedHosts: [], fetcher },
    ),
  ).toBe(job);
  expect(fetcher).not.toHaveBeenCalled();
});
it('updates repeated provider identities and balance snapshots without duplicates', () => {
  const r = new FinanceMemoryRepository();
  const payload = parseSimplefinV2(simplefinV2Fixture);
  importSimplefinAccounts(r, 'bridge', { type: 'owner', ownerId: actor.id }, payload);
  const id = r.transactions[0]!.id;
  const next = structuredClone(payload);
  next.accounts[0]!.transactions[0]!.amountMinor = -9000;
  next.accounts[0]!.transactions[0]!.pending = true;
  next.accounts[0]!.balanceMinor = 111111;
  next.accounts[0]!.balanceAt = '2026-02-01T00:00:00.000Z';
  importSimplefinAccounts(r, 'bridge', { type: 'owner', ownerId: actor.id }, next);
  expect(r.transactions).toHaveLength(1);
  expect(r.transactions[0]).toMatchObject({ id, amountMinor: -9000, pending: true });
  expect([...r.accounts.values()][0]!.currentBalanceMinor).toBe(111111);
});
it('isolates identical provider IDs across separate Bridge connections', () => {
  const r = new FinanceMemoryRepository();
  const payload = parseSimplefinV2(simplefinV2Fixture);
  importSimplefinAccounts(r, 'bridge-a', { type: 'owner', ownerId: 'a' }, payload);
  importSimplefinAccounts(r, 'bridge-b', { type: 'owner', ownerId: 'b' }, payload);
  expect(r.accounts.size).toBe(2);
  expect(r.transactions).toHaveLength(2);
  expect(new Set(r.transactions.map(({ accountId }) => accountId)).size).toBe(2);
});
async function privateItem() {
  const r = await setup();
  r.accounts.set(input.id, {
    ...r.accounts.get(input.id)!,
    scope: { type: 'group', groupId: 'group' },
  });
  r.accounts.set(
    'private',
    createFinancialAccount({
      ...input,
      id: 'private',
      scope: { type: 'owner', ownerId: 'someone-else' },
    }),
  );
  r.budgets.set('budget', {
    id: 'budget',
    groupId: 'group',
    name: 'Budget',
    budgetDate: '2026-01-01',
    startDate: '2026-01-01',
    endDate: null,
    status: 'active',
    version: 1,
  });
  r.budgetItems.set('item', {
    id: 'item',
    budgetId: 'budget',
    description: 'Hidden',
    financeCategoryId: 'category',
    merchantId: 'merchant',
    plannedAmountMinor: -100,
    currency: 'USD',
    currencyExponent: 2,
    relatedAccountIds: [input.id, 'private'],
    creatorId: 'someone-else',
    status: 'active',
    version: 1,
  });
  const t = createFinancialTransaction({
    ...txn(),
    accountId: input.id,
    origin: 'manual',
    currency: 'USD',
    pending: false,
    connectedAccount: false,
    merchantId: 'merchant',
  });
  r.transactions.push(t);
  return r;
}
it('does not suggest hidden mixed-account budget items', async () => {
  const r = await privateItem();
  expect(
    await evaluateFinanceTransactionMatches(r, actor, 'txn', () => 'match', 'evaluate'),
  ).toEqual([]);
});
it('rejects allocation references to a hidden budget item', async () => {
  const r = await privateItem();
  await expect(
    replaceTransactionAllocationsForActor(
      r,
      actor,
      'txn',
      {
        expectedVersion: 1,
        allocations: [
          {
            id: 'allocation',
            financeCategoryId: 'category',
            budgetItemId: 'item',
            amountMinor: -100,
          },
        ],
      },
      'allocate',
    ),
  ).rejects.toThrow(/not found/);
  expect(r.transactions[0]!.allocations).toEqual([]);
});
it('rejects task creation from a hidden private-account item', async () => {
  const r = await privateItem();
  expect(() =>
    createTaskFromFinanceBudgetItem(
      r,
      actor,
      'item',
      { taskId: 'task', linkId: 'link', label: 'Task', assigneeId: actor.id },
      'task',
    ),
  ).toThrow(/not found/);
  expect(r.tasks.size).toBe(0);
});
it('rejects non-finite transaction search limits', async () => {
  const r = await setup();
  expect(() => searchAuthorizedTransactions(r, actor, { query: '', limit: NaN })).toThrow(/limit/);
});
it('requires access to the original connection before completing account identity', async () => {
  const r = await setup();
  r.connections.set('bridge', { scope: { type: 'owner', ownerId: 'someone-else' } });
  r.pendingSimplefinAccounts.set('bridge:provider', {
    providerAccountId: 'provider',
    currency: 'USD',
    balanceMinor: 0,
    balanceAt: input.balanceAt,
    transactions: [],
  });
  expect(() =>
    completeSimplefinAccountIdentity(r, actor, 'bridge', 'provider', {
      scope: input.scope,
      sourceName: 'Checking',
      organizationName: 'Bank',
    }),
  ).toThrow(/not found/);
});

it('reauthorizes cached mutation receipts after account reassignment', async () => {
  const r = await setup();
  await createManualTransaction(r, actor, input.id, txn(), 'create');
  const balanceInput = {
    id: 'balance',
    expectedAccountVersion: r.accounts.get(input.id)!.version,
    balanceMinor: 900,
    effectiveAt: after,
    recordedAt: after,
  };
  await recordManualBalance(r, actor, input.id, balanceInput, 'balance');
  r.accounts.set(input.id, {
    ...r.accounts.get(input.id)!,
    scope: { type: 'owner', ownerId: 'someone-else' },
  });
  await expect(createManualTransaction(r, actor, input.id, txn(), 'create')).rejects.toThrow(
    'Finance record not found.',
  );
  await expect(recordManualBalance(r, actor, input.id, balanceInput, 'balance')).rejects.toThrow(
    'Finance record not found.',
  );
  expect(r.transactions).toHaveLength(1);
});

it.each(['category', 'merchant', 'permissions'] as const)(
  'revalidates catalog deletion: %s',
  async (change) => {
    const r = await setup();
    const { createUserFinanceCategory, createMerchant } = await import('@naaseh/domain');
    const category = createUserFinanceCategory({
      id: 'category',
      name: 'Catalog',
      creatorId: actor.id,
    });
    const merchant = createMerchant({
      id: 'merchant',
      name: 'Shop',
      source: 'manual',
      creatorId: actor.id,
    });
    r.categories.set(category.id, category);
    r.merchants.set(merchant.id, merchant);
    let currentActor = { ...actor, role: 'admin' as 'admin' | 'user' };
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository: r,
      actorFor: () => currentActor,
      deletionSigningSecret: 'test',
      allowedSimplefinHosts: [],
    });
    const type = change === 'merchant' ? 'merchant' : 'category';
    const route = registry.resolve(
      'GET',
      '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview',
    )!;
    const result = (await route({
      ...request('GET', '/'),
      pathParameters: { recordType: type, recordId: type },
    })) as { body: string };
    const preview = JSON.parse(result.body) as {
      outcome: string;
      expectedVersion: number;
      confirmationToken: string;
    };
    expect(preview.outcome).toBe('permanent-delete');
    if (change === 'permissions') currentActor = { ...actor, id: 'other-user', role: 'user' };
    else {
      await createManualTransaction(r, actor, input.id, txn(), 'create');
      if (change === 'merchant')
        r.transactions[0] = { ...r.transactions[0]!, merchantId: 'merchant' };
      else
        r.transactions[0] = {
          ...r.transactions[0]!,
          allocations: [
            {
              id: 'allocation',
              financeCategoryId: 'category',
              amountMinor: -100,
              createdBy: actor.id,
              createdAt: after,
              updatedAt: after,
            },
          ],
        };
    }
    const confirm = registry.resolve(
      'POST',
      '/api/v1/finance/records/{recordType}/{recordId}/deletion',
    )!;
    await expect(
      confirm({
        ...request('POST', '/'),
        pathParameters: { recordType: type, recordId: type },
        body: JSON.stringify({
          expectedVersion: preview.expectedVersion,
          confirmationToken: preview.confirmationToken,
        }),
      }),
    ).rejects.toThrow();
    expect(type === 'merchant' ? r.merchants.has(type) : r.categories.has(type)).toBe(true);
  },
);
