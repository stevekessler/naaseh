import { financeImportRowHash } from '../../apps/api/src/finance/runtime-import.js';
import { importSimplefinAccounts } from '../../apps/api/src/finance/connection-service.js';
import { parseSimplefinV2 } from '@naaseh/domain';
import { validateDurableFinanceRestore } from '../../apps/api/src/crypto-recovery/restore-testing-validator.js';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { KMSClient } from '@aws-sdk/client-kms';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createUlid, createImportJob, type Mutation } from '@naaseh/domain';
import { FinanceDynamoFixture } from '../fixtures/finance/dynamo.js';
import { DynamoFinanceRepository } from '../../apps/api/src/finance/durable-repository.js';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import { handler as syncHandler } from '../../apps/api/src/sync/handler.js';
import { handler as taskHandler } from '../../apps/api/src/tasks/handler.js';
import {
  dispatchFinanceMutation,
  authorizedFinanceProjection,
  commitDurableCsv,
} from '../../apps/api/src/finance/sync-runtime.js';
import { createManualAccount } from '../../apps/api/src/finance/account-service.js';
import { runDurableFinanceImport } from '../../apps/api/src/finance/runtime-import.js';
import { simplefinV2Fixture } from '../fixtures/finance/simplefin.js';
const group = createUlid(),
  account = createUlid(),
  budget = createUlid(),
  item = createUlid(),
  category = createUlid();
const actor = {
  id: 'owner',
  active: true,
  role: 'user' as const,
  groupMemberships: [{ groupId: group, role: 'owner' as const }],
};
let db: FinanceDynamoFixture;
const store = () => new DynamoFinanceRepository(db.client());
const accountInput = () => ({
  id: account,
  scope: { type: 'owner' as const, ownerId: actor.id },
  sourceName: 'Checking',
  organizationName: 'Bank',
  accountType: 'checking' as const,
  currency: 'USD',
  openingBalanceMinor: 1000,
  balanceAt: '2026-01-01T00:00:00.000Z',
});
const mutation = (
  type: Mutation['entityType'],
  id: string,
  payload: unknown,
  baseVersion = 0,
  operation: Mutation['operation'] = 'create',
): Mutation => ({
  id: createUlid(),
  entityId: id,
  entityType: type,
  operation,
  baseVersion,
  payload,
  createdAt: new Date().toISOString(),
  attempts: 0,
});
const request = (method: string, path: string, body?: unknown): APIGatewayProxyEventV2 =>
  ({
    version: '2.0',
    routeKey: `${method} /api/v1/finance/{proxy+}`,
    rawPath: path,
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'csrf',
      'idempotency-key': createUlid(),
    },
    requestContext: {
      requestId: 'test',
      http: { method },
      authorizer: { lambda: { userId: actor.id, role: actor.role, csrfToken: 'csrf' } },
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }) as APIGatewayProxyEventV2;
const parsed = async (response: ReturnType<ReturnType<typeof createFinanceHandler>>) => {
  const result = (await response) as { statusCode: number; body: string };
  expect(result.statusCode).toBeLessThan(400);
  return JSON.parse(result.body) as Record<string, unknown>;
};
beforeEach(() => {
  db = new FinanceDynamoFixture();
  vi.spyOn(DynamoDBDocumentClient.prototype, 'send').mockImplementation(db.send as never);
  db.put({ PK: 'USER#owner', SK: 'PROFILE', data: { active: true } });
  db.put({
    PK: 'USER#owner',
    SK: `GROUP#${group}`,
    data: { groupId: group, role: 'owner', status: 'active' },
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function seed() {
  const session = await store().load();
  await createManualAccount(session.repository, actor, accountInput(), 'account');
  await session.commit();
}
async function seedBudget() {
  await seed();
  await dispatchFinanceMutation(
    actor,
    mutation('financeBudget', budget, {
      groupId: group,
      name: 'Plan',
      budgetDate: '2026-01-01',
      startDate: '2026-01-01',
      status: 'active',
    }),
    store(),
  );
  await dispatchFinanceMutation(
    actor,
    mutation('financeBudgetAccountLink', createUlid(), { budgetId: budget, accountId: account }, 1),
    store(),
  );
  await dispatchFinanceMutation(
    actor,
    mutation(
      'financeBudgetItem',
      item,
      {
        budgetId: budget,
        description: 'Utilities',
        financeCategoryId: category,
        plannedAmountMinor: -100,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [account],
      },
      2,
    ),
    store(),
  );
}
it('persists per-record account and receipt state across independent repository instances', async () => {
  await seed();
  const fresh = await store().load();
  expect(fresh.repository.accounts.get(account)?.currentBalanceMinor).toBe(1000);
  expect(fresh.repository.mutationReceipts.size).toBe(1);
  expect([...db.items.keys()].some((key) => key.includes('RECORD#accounts#'))).toBe(true);
});
it('rejects stale concurrent writers atomically', async () => {
  const a = await store().load(),
    b = await store().load();
  a.repository.categories.set('a', {
    id: 'a',
    name: 'A',
    canonicalName: 'a',
    origin: 'user',
    creatorId: actor.id,
    status: 'active',
    version: 1,
  });
  b.repository.categories.set('b', {
    id: 'b',
    name: 'B',
    canonicalName: 'b',
    origin: 'user',
    creatorId: actor.id,
    status: 'active',
    version: 1,
  });
  await a.commit();
  await expect(b.commit()).rejects.toMatchObject({ name: 'TransactionCanceledException' });
  expect((await store().load()).repository.categories.has('b')).toBe(false);
});
it('commits multiple bounded units without reloading or replaying old feed writes', async () => {
  const session = await store().load();
  await createManualAccount(session.repository, actor, accountInput(), 'account');
  await session.commit();
  session.repository.accounts.set(account, {
    ...session.repository.accounts.get(account)!,
    friendlyName: 'Updated',
  });
  await session.commit();
  expect((await store().load()).repository.accounts.get(account)?.friendlyName).toBe('Updated');
});
it('restores canonical records including maps and sets from a backup copy', async () => {
  await seed();
  const session = await store().load();
  session.repository.keptSeparatePairs.add('one');
  session.repository.csvBatches.set('batch', {
    id: 'batch',
    accountId: account,
    fileDigest: 'a'.repeat(64),
    chunks: new Map([[0, 'digest']]),
  });
  await session.commit();
  const backup = structuredClone([...db.items]);
  db.items.clear();
  for (const [key, value] of backup) db.items.set(key, value);
  const restored = await store().load();
  expect(restored.repository.keptSeparatePairs.has('one')).toBe(true);
  expect(
    (restored.repository.csvBatches.get('batch') as { chunks: Map<number, string> }).chunks.get(0),
  ).toBe('digest');
  expect(validateDurableFinanceRestore([...db.items.values()]).passed).toBe(true);
  const broken = [...db.items.values()].map((row) =>
    row.SK === `RECORD#accounts#${account}` ? { ...row, SK: 'REMOVED' } : row,
  );
  expect(() => validateDurableFinanceRestore(broken)).toThrow(/Finance relationships/);
});
it('serves a cold-start API read after a different handler instance creates the account', async () => {
  const created = await parsed(
    createFinanceHandler()(
      request(
        'POST',
        '/api/v1/finance/accounts',
        Object.fromEntries(Object.entries(accountInput()).filter(([key]) => key !== 'id')),
      ),
    ),
  );
  const fresh = await parsed(
    createFinanceHandler()(request('GET', `/api/v1/finance/accounts/${String(created.id)}`)),
  );
  expect(fresh.id).toBe(created.id);
  const snapshot = await parsed(
    createFinanceHandler()(request('GET', '/api/v1/finance/sync/bootstrap')),
  );
  expect(typeof snapshot.token).toBe('string');
  const unchanged = (await createFinanceHandler()({
    ...request('GET', '/api/v1/finance/sync/bootstrap'),
    queryStringParameters: { known: String(snapshot.token) },
  })) as { statusCode: number };
  expect(unchanged.statusCode).toBe(304);
});
it('persists an offline budget through the production sync HTTP dispatcher', async () => {
  const command = mutation('financeBudget', budget, {
    groupId: group,
    name: 'Offline',
    budgetDate: '2026-01-01',
    startDate: '2026-01-01',
  });
  const response = (await syncHandler(
    request('POST', '/api/v1/sync/push', { contractVersion: 7, mutations: [command] }),
  )) as { statusCode: number; body: string };
  expect(response.statusCode).toBe(200);
  expect(JSON.parse(response.body).results[0].status).toBe('applied');
  expect((await store().load()).repository.budgets.get(budget)?.name).toBe('Offline');
});
it('replays a persisted mutation receipt after a cold start', async () => {
  const command = mutation('financeBudget', budget, {
    groupId: group,
    name: 'Offline',
    budgetDate: '2026-01-01',
    startDate: '2026-01-01',
  });
  await dispatchFinanceMutation(actor, command, store());
  expect((await dispatchFinanceMutation(actor, command, store())).status).toBe('applied');
  expect((await store().load()).repository.budgets.size).toBe(1);
});
it('hydrates parent budget, account link and item from separately committed commands', async () => {
  await seedBudget();
  const repository = (await store().load()).repository;
  expect(repository.budgets.get(budget)?.version).toBe(3);
  expect(repository.budgetItems.has(item)).toBe(true);
});
it('rejects a revoked member without persisting the queued mutation', async () => {
  const revoked = { ...actor, groupMemberships: [] };
  expect(
    (
      await dispatchFinanceMutation(
        revoked,
        mutation('financeBudget', budget, {
          groupId: group,
          name: 'Denied',
          budgetDate: '2026-01-01',
          startDate: '2026-01-01',
        }),
        store(),
      )
    ).status,
  ).toBe('rejected');
  expect((await store().load()).repository.budgets.size).toBe(0);
});
it('returns a content-free conflict on a stale offline edit', async () => {
  await seedBudget();
  const result = await dispatchFinanceMutation(
    actor,
    mutation('financeBudget', budget, { name: 'Stale' }, 1, 'update'),
    store(),
  );
  expect(result).toMatchObject({ status: 'conflict' });
  expect(JSON.stringify(result)).not.toContain('Utilities');
});
it('commits a hundred-row CSV request in bounded atomic units and replays safely', async () => {
  await seed();
  const input = {
    accountId: account,
    batchId: createUlid(),
    fileDigest: 'a'.repeat(64),
    duplicateDecisionDigest: 'b'.repeat(64),
    duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
    chunkIndex: 0,
    finalChunk: true,
    rows: Array.from({ length: 100 }, (_, index) => ({
      ordinal: index + 1,
      amountMinor: 1,
      description: `Row ${index}`,
      transactedAt: '2026-01-02T00:00:00.000Z',
    })),
  };
  await commitDurableCsv(actor, input, store());
  await commitDurableCsv(actor, input, store());
  expect((await store().load()).repository.transactions).toHaveLength(100);
  expect(db.transactions.every((value) => (value as unknown[]).length <= 100)).toBe(true);
});
it('omits private account items from a second members snapshot', async () => {
  await seedBudget();
  const repository = (await store().load()).repository;
  const records = authorizedFinanceProjection(repository, { ...actor, id: 'other' });
  expect(records.some((record) => record.entityType === 'financeBudgetItem')).toBe(false);
  expect(JSON.stringify(records)).not.toContain(account);
});
it('revokes all protected projections when membership is removed', async () => {
  await seedBudget();
  const records = authorizedFinanceProjection((await store().load()).repository, {
    ...actor,
    id: 'other',
    groupMemberships: [],
  });
  expect(records).toEqual([]);
});
it('atomically creates an ordinary task readable through the normal task API', async () => {
  await seedBudget();
  const result = await parsed(
    createFinanceHandler()(
      request('POST', `/api/v1/finance/budget-items/${item}/tasks`, {
        label: 'Pay utilities',
        assigneeId: actor.id,
      }),
    ),
  );
  const response = await taskHandler({
    ...request('GET', `/api/v1/tasks/${String(result.taskId)}`),
    pathParameters: { taskId: String(result.taskId) },
  });
  expect(typeof response).toBe('object');
  const body = JSON.parse((response as { body: string }).body);
  expect(body.label).toBe('Pay utilities');
  expect(
    [...db.items.values()].some(
      (row) => row.PK === `TASK#${String(result.taskId)}` && String(row.SK).startsWith('REV#'),
    ),
  ).toBe(true);
});
it('keeps Finance relationship metadata out of ordinary task feeds', async () => {
  await seedBudget();
  const result = await parsed(
    createFinanceHandler()(
      request('POST', `/api/v1/finance/budget-items/${item}/tasks`, {
        label: 'Pay utilities',
        assigneeId: actor.id,
      }),
    ),
  );
  const publicFeed = [...db.items.values()].filter((row) => row.PK === 'FEED#PUBLIC');
  expect(JSON.stringify(publicFeed)).toContain(String(result.taskId));
  expect(JSON.stringify(publicFeed)).not.toContain(item);
  const snapshot = await parsed(
    createFinanceHandler()(request('GET', '/api/v1/finance/sync/bootstrap')),
  );
  // Task privacy changes outside Finance must never be hidden by its unchanged epoch.
  const response = await createFinanceHandler()({
    ...request('GET', '/api/v1/finance/sync/bootstrap'),
    queryStringParameters: { known: String(snapshot.token) },
  });
  expect((response as { statusCode: number }).statusCode).toBe(200);
});
it('rejects inactive assignees before creating any task or Finance relationship', async () => {
  await seedBudget();
  db.put({ PK: 'USER#inactive', SK: 'PROFILE', data: { active: false } });
  const response = (await createFinanceHandler()(
    request('POST', `/api/v1/finance/budget-items/${item}/tasks`, {
      label: 'No task',
      assigneeId: 'inactive',
    }),
  )) as { statusCode: number };
  expect(response.statusCode).toBe(404);
  expect((await store().load()).repository.financialTaskLinks.size).toBe(0);
});
it('runs a persisted refresh job in an independent worker instance', async () => {
  const session = await store().load();
  session.repository.connections.set('bridge', {
    id: 'bridge',
    scope: { type: 'owner', ownerId: actor.id },
    provider: 'simplefin-bridge',
    status: 'active',
    encryptedAccessUrl: 'AQID',
    credentialKeyId: 'key',
    credentialContextVersion: 1,
    version: 1,
  });
  session.repository.importJobs.set('job', createImportJob('job', 'bridge'));
  session.repository.importDispatches.set('job', { jobId: 'job', connectionId: 'bridge' });
  await session.commit();
  vi.spyOn(KMSClient.prototype, 'send').mockResolvedValue({
    Plaintext: new TextEncoder().encode('https://user:pass@bridge.simplefin.org/simplefin'),
  } as never);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(simplefinV2Fixture))),
  );
  await runDurableFinanceImport({ dispatchPending: true }, store());
  const fresh = await store().load();
  expect(fresh.repository.importJobs.get('job')?.status).toBe('succeeded');
  expect(fresh.repository.accounts.size).toBe(1);
  expect(fresh.repository.importDispatches.size).toBe(0);
  const connections = await parsed(
    createFinanceHandler()(request('GET', '/api/v1/finance/connections')),
  );
  expect(connections.items).toHaveLength(1);
  expect(JSON.stringify(connections)).not.toContain('AQID');
  expect(JSON.stringify(connections)).not.toContain('credentialKeyId');
});
it('fails a stale deletion confirmation after a transaction was committed by another API instance', async () => {
  await seed();
  const preview = await parsed(
    createFinanceHandler()(
      request('GET', `/api/v1/finance/records/account/${account}/deletion-preview`),
    ),
  );
  await parsed(
    createFinanceHandler()(
      request('POST', `/api/v1/finance/accounts/${account}/transactions`, {
        amountMinor: 1,
        transactedAt: '2026-01-02T00:00:00.000Z',
        description: 'New',
      }),
    ),
  );
  const result = (await createFinanceHandler()(
    request('POST', `/api/v1/finance/records/account/${account}/deletion`, {
      expectedVersion: preview.expectedVersion,
      confirmationToken: preview.confirmationToken,
    }),
  )) as { statusCode: number };
  expect(result.statusCode).toBe(409);
  expect((await store().load()).repository.accounts.has(account)).toBe(true);
});

async function seedHashJob() {
  const session = await store().load();
  session.repository.connections.set('bridge', {
    id: 'bridge',
    scope: { type: 'owner', ownerId: actor.id },
    provider: 'simplefin-bridge',
    status: 'active',
    encryptedAccessUrl: 'AQID',
    credentialKeyId: 'key',
    credentialContextVersion: 1,
    version: 1,
  });
  session.repository.importJobs.set('job', createImportJob('job', 'bridge'));
  session.repository.importDispatches.set('job', { jobId: 'job', connectionId: 'bridge' });
  await session.commit();
  vi.spyOn(KMSClient.prototype, 'send').mockResolvedValue({
    Plaintext: new TextEncoder().encode('https://user:pass@bridge.simplefin.org/simplefin'),
  } as never);
}
it('hashes canonical provider rows independently of property order and detects corrections', () => {
  expect(financeImportRowHash({ id: 'row', amountMinor: 1 })).toBe(
    financeImportRowHash({ amountMinor: 1, id: 'row' }),
  );
  expect(financeImportRowHash({ id: 'row', amountMinor: 2 })).not.toBe(
    financeImportRowHash({ id: 'row', amountMinor: 1 }),
  );
});
it('resumes by row hashes when provider rows are inserted before an old checkpoint', async () => {
  await seedHashJob();
  const payload = structuredClone(simplefinV2Fixture);
  const template = payload.accounts[0]!.transactions[0]!;
  payload.accounts[0]!.transactions = ['b', 'c', 'd', 'e', 'f', 'g'].map((id) => ({
    ...template,
    id,
  }));
  const parsed = parseSimplefinV2(payload);
  const session = await store().load();
  const source = parsed.accounts[0]!;
  importSimplefinAccounts(
    session.repository,
    'bridge',
    { type: 'owner', ownerId: actor.id },
    { ...parsed, accounts: [{ ...source, transactions: source.transactions.slice(0, 5) }] },
  );
  const prefix = JSON.stringify(['job', source.providerConnectionId, source.providerAccountId]);
  for (const row of source.transactions.slice(0, 5))
    session.repository.importRowReceipts.set(
      `${prefix}:row:${row.sourceTransactionId}`,
      financeImportRowHash(row),
    );
  session.repository.importJobs.set('job', {
    ...session.repository.importJobs.get('job')!,
    status: 'running',
    attempts: 1,
    leaseUntil: new Date(0).toISOString(),
    providerOffset: 1,
  });
  await session.commit();
  payload.accounts[0]!.transactions.unshift({ ...template, id: 'a' });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload))),
  );
  await runDurableFinanceImport({ jobId: 'job', connectionId: 'bridge' }, store());
  const fresh = await store().load();
  expect(fresh.repository.transactions.map((row) => row.sourceTransactionId).sort()).toEqual([
    'a',
    'b',
    'c',
    'd',
    'e',
    'f',
    'g',
  ]);
  expect(fresh.repository.importJobs.get('job')?.status).toBe('succeeded');
});
it('keeps a transiently conflicting import queued and safely retries uncommitted rows', async () => {
  await seedHashJob();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(simplefinV2Fixture))),
  );
  let writes = 0;
  const send = async (command: unknown) => {
    if (
      (command as { constructor: { name: string } }).constructor.name === 'TransactWriteCommand' &&
      ++writes === 2
    )
      throw Object.assign(new Error('Concurrent update'), { name: 'TransactionCanceledException' });
    return db.send(command);
  };
  await runDurableFinanceImport(
    { jobId: 'job', connectionId: 'bridge' },
    new DynamoFinanceRepository({ send } as never),
  );
  let fresh = await store().load();
  expect(fresh.repository.importJobs.get('job')?.status).toBe('running');
  expect(fresh.repository.importDispatches.get('job')?.failures).toBe(1);
  expect(fresh.repository.transactions).toHaveLength(0);
  expect(fresh.repository.importRowReceipts.size).toBe(0);
  fresh.repository.importJobs.set('job', {
    ...fresh.repository.importJobs.get('job')!,
    leaseUntil: new Date(0).toISOString(),
  });
  fresh.repository.importDispatches.set('job', {
    ...fresh.repository.importDispatches.get('job')!,
    notBefore: new Date(0).toISOString(),
  });
  await fresh.commit();
  await runDurableFinanceImport({ dispatchPending: true }, store());
  fresh = await store().load();
  expect(fresh.repository.transactions).toHaveLength(1);
  expect(fresh.repository.importJobs.get('job')?.status).toBe('succeeded');
  fresh.repository.importJobs.set('job', {
    ...fresh.repository.importJobs.get('job')!,
    status: 'running',
    leaseUntil: new Date(0).toISOString(),
  });
  fresh.repository.importDispatches.set('job', { jobId: 'job', connectionId: 'bridge' });
  await fresh.commit();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('Network unavailable');
    }),
  );
  await runDurableFinanceImport({ jobId: 'job', connectionId: 'bridge' }, store());
  const networkRetry = await store().load();
  expect(networkRetry.repository.importDispatches.get('job')?.failures).toBe(1);
  expect(networkRetry.repository.importJobs.get('job')?.status).toBe('running');
});
it('processes a changed provider row even when its identity already has a committed hash', async () => {
  await seedHashJob();
  let payload = structuredClone(simplefinV2Fixture);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(payload))),
  );
  await runDurableFinanceImport({ jobId: 'job', connectionId: 'bridge' }, store());
  const session = await store().load();
  session.repository.importJobs.set('job', {
    ...session.repository.importJobs.get('job')!,
    status: 'running',
    leaseUntil: new Date(0).toISOString(),
  });
  session.repository.importDispatches.set('job', { jobId: 'job', connectionId: 'bridge' });
  await session.commit();
  payload = structuredClone(payload);
  payload.accounts[0]!.transactions[0]!.amount = '-90.00';
  await runDurableFinanceImport({ jobId: 'job', connectionId: 'bridge' }, store());
  const fresh = await store().load();
  expect(fresh.repository.transactions).toHaveLength(1);
  expect(fresh.repository.transactions[0]?.amountMinor).toBe(-9000);
  expect(fresh.repository.importJobs.get('job')?.counts.updated).toBe(1);
});
