import { balanceSnapshotSchema, financialTransactionSchema } from '@naaseh/contracts';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { handler as syncHandler } from '../../apps/api/src/sync/handler.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import {
  GetCommand,
  QueryCommand,
  TransactGetCommand,
  TransactWriteCommand,
} from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { DynamoFinanceRepository } from '../../apps/api/src/finance/dynamo-repository.js';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import { createManualAccount } from '../../apps/api/src/finance/account-service.js';
import { commitAuthorizedCsvImportChunk } from '../../apps/api/src/finance/csv-import-service.js';
import {
  claimSimplefinConnection,
  dispatchSimplefinRefresh,
  importSimplefinAccountsDurably,
} from '../../apps/api/src/finance/connection-service.js';
import {
  executeFinanceImport,
  handler as importHandler,
} from '../../apps/api/src/finance/import-handler.js';
import {
  createBudget,
  createBudgetItem,
  createReusableBudgetItem,
  createTransactionMatch,
  createUserFinanceCategory,
  createMerchant,
  createFinancialTransaction,
  createUpcomingExpense,
  attachmentSchema,
  attachmentBlobSchema,
  replaceTransactionAllocations,
} from '@naaseh/domain';
import {
  createFinanceBudget,
  linkFinanceBudgetAccount,
  getFinanceBudget,
} from '../../apps/api/src/finance/budget-service.js';
import {
  authorizedFinancialTaskLinksForTask,
  authorizedTasksForFinancialTarget,
  createAuthorizedFinancialTaskLink,
  createTaskFromFinanceBudgetItem,
  createTaskFromFinanceTarget,
} from '../../apps/api/src/finance/task-link-service.js';
import { reconcileProviderImport } from '../../apps/api/src/finance/provider-reconciliation-service.js';
import { financeKeys } from '../../apps/api/src/finance/repository.js';
import { linkUpcomingExpenseFulfillment } from '../../apps/api/src/finance/upcoming-expense-service.js';
import { resolveReceiptTransaction } from '../../apps/api/src/finance/receipt-transaction-source.js';
import { createReceiptContentReader } from '../../apps/api/src/attachments/receipt-content-service.js';
import { financeBudgetAccountPairKey } from '../../apps/api/src/finance/budget-account-link-index.js';
import { simplefinV2Fixture } from '../fixtures/finance/simplefin.js';
import {
  reconcileFinanceBudget,
  listBudgetReconciliationHistory,
} from '../../apps/api/src/finance/reconciliation-service.js';

const accessState = vi.hoisted(() => ({
  canonicalMemberships: undefined as
    | Array<{ groupId: string; role: 'owner' | 'manager' | 'member'; status: 'active' | 'removed' }>
    | undefined,
  memberships: [] as Array<{
    groupId: string;
    role: 'owner' | 'manager' | 'member';
    status: 'active' | 'removed';
  }>,
}));
vi.mock('../../apps/api/src/groups/group-repository.js', () => ({
  listUserMemberships: async () => accessState.memberships,
  getMembership: async (groupId: string, userId: string) => {
    const member = (accessState.canonicalMemberships ?? accessState.memberships).find(
      (value) => value.groupId === groupId,
    );
    return member ? { ...member, userId } : undefined;
  },
}));

const actor = { id: 'owner-1', role: 'user' as const, active: true, groupMemberships: [] };
const accountInput = {
  id: '01J00000000000000000000001',
  scope: { type: 'owner' as const, ownerId: actor.id },
  sourceName: 'Checking',
  organizationName: 'Fixture Bank',
  accountType: 'checking' as const,
  currency: 'USD',
  openingBalanceMinor: 10000,
  balanceAt: '2026-01-01T00:00:00.000Z',
};
const store = new Map<string, Record<string, unknown>>();
const keyOf = (key: Record<string, unknown>) => `${key.PK}/${key.SK}`;
let transactions: TransactWriteCommand[];
let failCommit = false;
let failCommitAt = -1;
let pageSize = 200;
const event = (method: string, path: string, body?: unknown, mutationId = 'mutation-1') =>
  ({
    version: '2.0',
    routeKey: `${method} /api/v1/finance/{proxy+}`,
    rawPath: path,
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'csrf',
      'idempotency-key': mutationId,
    },
    requestContext: {
      requestId: 'request-1',
      http: { method },
      authorizer: {
        lambda: { userId: actor.id, role: 'user', csrfToken: 'csrf', sessionHash: 'a'.repeat(64) },
      },
    },
    pathParameters: { proxy: path.slice('/api/v1/finance/'.length) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }) as unknown as APIGatewayProxyEventV2;
const bodyOf = (response: Awaited<ReturnType<ReturnType<typeof createFinanceHandler>>>) =>
  JSON.parse(typeof response === 'object' && 'body' in response ? (response.body ?? '{}') : '{}');

beforeEach(() => {
  vi.restoreAllMocks();
  accessState.memberships = [];
  accessState.canonicalMemberships = undefined;
  store.clear();
  store.set(keyOf({ PK: `USER#${actor.id}`, SK: 'PROFILE' }), {
    PK: `USER#${actor.id}`,
    SK: 'PROFILE',
    data: { id: actor.id, role: 'user', active: true, sessionEpoch: 0, tfaStatus: 'disabled' },
  });
  store.set(keyOf({ PK: `SESSION#${'a'.repeat(64)}`, SK: 'SESSION' }), {
    PK: `SESSION#${'a'.repeat(64)}`,
    SK: 'SESSION',
    data: {
      id: 'finance-runtime-session',
      userId: actor.id,
      csrfToken: 'c'.repeat(32),
      sessionEpoch: 0,
      createdAt: new Date().toISOString(),
      idleExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      absoluteExpiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
    },
  });

  transactions = [];
  failCommit = false;
  failCommitAt = -1;
  pageSize = 200;
  vi.spyOn(dynamodb, 'send').mockImplementation((async (command: unknown) => {
    if (command instanceof TransactGetCommand)
      return {
        Responses: command.input.TransactItems!.map(({ Get }) => ({
          Item: structuredClone(store.get(keyOf(Get!.Key!))),
        })),
      };
    if (command instanceof GetCommand)
      return { Item: structuredClone(store.get(keyOf(command.input.Key!))) };
    if (command instanceof QueryCommand) {
      const values = command.input.ExpressionAttributeValues!;
      const rows = [...store.values()]
        .filter(
          (row) =>
            row.PK === values[':pk'] &&
            (values[':first'] !== undefined
              ? String(row.SK) >= String(values[':first']) &&
                String(row.SK) <= String(values[':last'])
              : String(row.SK).startsWith(String(values[':row'] ?? values[':prefix'] ?? ''))),
        )
        .sort((a, b) => String(a.SK).localeCompare(String(b.SK)));
      const offset = command.input.ExclusiveStartKey
        ? rows.findIndex((row) => keyOf(row) === keyOf(command.input.ExclusiveStartKey!)) + 1
        : 0;
      const items = rows.slice(offset, offset + Math.min(pageSize, command.input.Limit!));
      const last = items.at(-1);
      return {
        Items: structuredClone(items),
        ...(offset + items.length < rows.length && last
          ? { LastEvaluatedKey: { PK: last.PK, SK: last.SK } }
          : {}),
      };
    }
    if (!(command instanceof TransactWriteCommand))
      throw new Error('Unexpected storage operation.');
    transactions.push(command);
    if (failCommit || transactions.length === failCommitAt)
      throw new Error('Simulated storage outage.');
    const writes = command.input.TransactItems!;
    const keys = writes.map((write) => {
      const operation = write.Put ?? write.Delete ?? write.Update ?? write.ConditionCheck!;
      return keyOf('Item' in operation ? operation.Item! : operation.Key!);
    });
    expect(new Set(keys).size).toBe(keys.length);
    expect(writes.length).toBeLessThanOrEqual(100);
    for (const write of writes) {
      const operation = write.Put ?? write.Delete ?? write.Update ?? write.ConditionCheck!;
      const key = 'Item' in operation ? operation.Item! : operation.Key!;
      const current = store.get(keyOf(key));
      const condition = operation.ConditionExpression;
      let passes = true;
      if (condition === 'attribute_not_exists(PK)') passes = !current;
      else if (condition === 'attribute_not_exists(PK) OR #location = :expectedLocation')
        passes =
          !current ||
          isDeepStrictEqual(
            current.storageKey,
            operation.ExpressionAttributeValues?.[':expectedLocation'],
          );
      else if (
        condition ===
        'attribute_not_exists(PK) OR (#linkId = :linkId AND #storageKey = :storageKey)'
      )
        passes =
          !current ||
          (current.linkId === operation.ExpressionAttributeValues?.[':linkId'] &&
            isDeepStrictEqual(
              current.storageKey,
              operation.ExpressionAttributeValues?.[':storageKey'],
            ));
      else if (condition === '#version = :expected')
        passes = current?.version === operation.ExpressionAttributeValues?.[':expected'];
      else if (condition === '#data = :membership')
        passes = isDeepStrictEqual(
          current?.data,
          operation.ExpressionAttributeValues?.[':membership'],
        );
      else if (condition === '#revision = :expected')
        passes = current?.revision === operation.ExpressionAttributeValues?.[':expected'];
      else if (condition === '#publicationId = :publicationId AND #format = :format')
        passes =
          current?.publicationId === operation.ExpressionAttributeValues?.[':publicationId'] &&
          current?.format === operation.ExpressionAttributeValues?.[':format'];
      else if (condition === 'attribute_not_exists(#value) OR #value=:expected')
        passes = !current || current.value === operation.ExpressionAttributeValues?.[':expected'];
      else if (condition === 'attribute_not_exists(PK) OR #data.#version = :base')
        passes =
          !current ||
          (current.data as { version: number }).version ===
            operation.ExpressionAttributeValues?.[':base'];
      else if (condition) throw new Error(`Unhandled test condition: ${condition}`);
      if (!passes)
        throw Object.assign(new Error('Conditional write rejected.'), {
          name: 'TransactionCanceledException',
        });
    }
    for (const write of writes) {
      if (write.Put) store.set(keyOf(write.Put.Item!), structuredClone(write.Put.Item!));
      if (write.Delete) store.delete(keyOf(write.Delete.Key!));
      if (write.Update)
        store.set(keyOf(write.Update.Key!), {
          ...write.Update.Key,
          value: write.Update.ExpressionAttributeValues![':next'],
        });
    }
    return {};
  }) as never);
});

async function createAccount() {
  const repository = await DynamoFinanceRepository.forActor(actor);
  await createManualAccount(repository, actor, accountInput, 'create-account');
  await repository.commit();
}
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Finance deployed storage and routing', () => {
  it('loads administrator owner/member partitions and permits bounded member budget edits only', async () => {
    await createAccount();
    const admin = {
      ...actor,
      role: 'admin' as const,
      groupMemberships: [{ groupId: 'shared', role: 'member' as const }],
    };
    const queries: string[] = [];
    const send = vi.mocked(dynamodb.send).getMockImplementation()!;
    vi.spyOn(dynamodb, 'send').mockImplementation(async (command: unknown) => {
      if (command instanceof QueryCommand)
        queries.push(String(command.input.ExpressionAttributeValues?.[':pk']));
      return send(command as never);
    });
    const repository = await DynamoFinanceRepository.forActor(admin);
    expect(repository.accounts.has(accountInput.id)).toBe(true);
    expect(queries).toContain('FINANCE#SCOPE#GROUP#shared');
    expect(
      queries.every((PK) =>
        ['FINANCE#CATALOG', 'FINANCE#SCOPE#OWNER#owner-1', 'FINANCE#SCOPE#GROUP#shared'].includes(
          PK,
        ),
      ),
    ).toBe(true);
    const groupRepository = await DynamoFinanceRepository.forActor(admin);
    const budget = await createFinanceBudget(
      groupRepository,
      admin,
      {
        id: '01J00000000000000000000999',
        groupId: 'shared',
        name: 'Admin member budget',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
        status: 'active',
      },
      'admin-budget',
    );
    await groupRepository.commit();
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'admin-owned-finance-test-'.repeat(4));
    store.set(keyOf({ PK: `USER#${actor.id}`, SK: 'PROFILE' }), {
      PK: `USER#${actor.id}`,
      SK: 'PROFILE',
      data: { id: actor.id, role: 'admin', active: true, sessionEpoch: 0, tfaStatus: 'enabled' },
    });
    accessState.memberships = [{ groupId: 'shared', role: 'member', status: 'active' }];
    const adminEvent = (method: string, path: string, body?: unknown) => {
      const request = event(method, path, body);
      const auth = request.requestContext.authorizer as { lambda: { role: string } };
      auth.lambda.role = 'admin';
      return request;
    };
    const accountResponse = await createFinanceHandler()(
      adminEvent('GET', `/api/v1/finance/accounts/${accountInput.id}`),
    );
    expect(accountResponse).toMatchObject({ statusCode: 200 });
    expect(bodyOf(accountResponse)).toMatchObject({ id: accountInput.id });
    const pulled = (await syncHandler(
      adminEvent('POST', '/api/v1/sync/pull', {
        contractVersion: 8,
        financeCacheProtocol: 1,
        cursor: {},
        financeCursor: {},
      }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(pulled.statusCode).toBe(200);
    const delivery = JSON.parse(pulled.body);
    expect(delivery.financeChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'financeAccount', entityId: accountInput.id }),
        expect.objectContaining({ entityType: 'financeBudget', entityId: budget.id }),
      ]),
    );
    expect(delivery.financeCache?.proof).toMatch(/^fc1\./u);
    const fingerprint = createHash('sha256').update('admin-budget-edit').digest('hex');
    const bounded = await DynamoFinanceRepository.forActor(
      admin,
      'admin-edit',
      fingerprint,
      budget.id,
    );
    expect(bounded.budgets.has(budget.id)).toBe(true);
    await expect(
      DynamoFinanceRepository.forActor(
        { ...admin, groupMemberships: [] },
        'admin-denied',
        fingerprint,
        budget.id,
      ),
    ).rejects.toThrow(/not found/i);
  });
  it('publishes a canonical account rename even when its legacy route does not append a feed event', async () => {
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'fallback-feed-fixture-secret-'.repeat(4));
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    await createAccount();
    const patch = await createFinanceHandler()(
      event('PATCH', `/api/v1/finance/accounts/${accountInput.id}`, {
        expectedVersion: 1,
        friendlyName: 'Renamed checking',
      }),
    );
    expect(patch).toMatchObject({ statusCode: 200 });
    const response = (await syncHandler(
      event('POST', '/api/v1/sync/pull', {
        contractVersion: 8,
        financeCacheProtocol: 1,
        cursor: { owner: 2 },
        financeCursor: { owner: 2 },
      }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.financeChanges).toHaveLength(1);
    expect(body.financeChanges[0]).toMatchObject({
      entityType: 'financeAccount',
      entityId: accountInput.id,
      version: 2,
      payload: { friendlyName: 'Renamed checking' },
    });
    expect(body.financeCursor.owner).toBe(3);
    const catchup = (await syncHandler(
      event('POST', '/api/v1/sync/pull', {
        contractVersion: 8,
        financeCacheProtocol: 1,
        cursor: {},
        financeCursor: {},
      }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(catchup.statusCode).toBe(200);
    const caught = JSON.parse(catchup.body);
    expect(caught.financeChanges).toHaveLength(2);
    expect(
      caught.financeChanges.filter(
        (change: { entityType: string }) => change.entityType === 'financeAccount',
      ),
    ).toEqual([
      expect.objectContaining({
        entityId: accountInput.id,
        version: 2,
        payload: expect.objectContaining({ friendlyName: 'Renamed checking' }),
      }),
    ]);
    expect(caught.financeCursor.owner).toBe(3);
  });
  it('publishes a new global merchant through its protected lane without releasing it to ordinary sync', async () => {
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'fallback-feed-fixture-secret-'.repeat(4));
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const created = await createFinanceHandler()(
      event(
        'POST',
        '/api/v1/finance/merchants',
        { name: 'New fixture merchant' },
        'merchant-create',
      ),
    );
    expect(created).toMatchObject({ statusCode: 201 });
    const merchant = bodyOf(created);
    const request = async (extra: object) =>
      syncHandler(
        event('POST', '/api/v1/sync/pull', {
          contractVersion: 8,
          cursor: {},
          financeCursor: {},
          ...extra,
        }),
        {} as never,
        () => undefined,
      ) as Promise<{ statusCode: number; body: string }>;
    const held = await request({ deliverFinance: false });
    expect(held.statusCode).toBe(200);
    expect(held.body).not.toContain(merchant.name);
    const allowed = await request({ financeCacheProtocol: 1 });
    expect(allowed.statusCode).toBe(200);
    const body = JSON.parse(allowed.body);
    expect(body.financeChanges).toHaveLength(1);
    expect(body.financeChanges[0]).toMatchObject({
      audience: 'PUBLIC',
      entityType: 'financeMerchant',
      entityId: merchant.id,
      version: 1,
      payload: { name: merchant.name },
    });
    expect(body.financeCursor.public).toBe(1);
    await createAccount();
    const activityRepository = await DynamoFinanceRepository.forActor(actor);
    activityRepository.transactions.push(
      createFinancialTransaction({
        id: '01J00000000000000000000888',
        accountId: accountInput.id,
        origin: 'manual',
        amountMinor: -1200,
        currency: 'USD',
        transactedAt: '2026-01-02T00:00:00Z',
        description: 'Synthetic private merchant activity',
        pending: false,
        connectedAccount: false,
        merchantId: merchant.id,
      }),
    );
    await activityRepository.commit();
    const transactionRequest = event(
      'GET',
      '/api/v1/finance/transactions/01J00000000000000000000888',
    );
    transactionRequest.headers['x-finance-cache-protocol'] = '1';
    vi.mocked(dynamodb.send).mockClear();
    const targetedTransaction = (await createFinanceHandler()(transactionRequest)) as {
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    };
    expect(targetedTransaction.statusCode).toBe(200);
    expect(JSON.parse(targetedTransaction.body)).toMatchObject({
      id: '01J00000000000000000000888',
      description: 'Synthetic private merchant activity',
    });
    expect(targetedTransaction.headers['x-finance-cache-proof']).toMatch(/^fc1\./u);
    expect(
      vi
        .mocked(dynamodb.send)
        .mock.calls.some(
          ([command]) => command instanceof QueryCommand || command instanceof TransactWriteCommand,
        ),
    ).toBe(false);
    const locatorKey = 'FINANCE#LOCATOR#transactions#01J00000000000000000000888/CURRENT';
    const locator = store.get(locatorKey)!;
    store.delete(locatorKey);
    vi.mocked(dynamodb.send).mockClear();
    expect(await createFinanceHandler()(transactionRequest)).toMatchObject({ statusCode: 404 });
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
    store.set(locatorKey, locator);
    const storageKey = locator.storageKey as { PK: string; SK: string };
    const foreignPK = 'FINANCE#SCOPE#OWNER#foreign-user';
    store.set(locatorKey, { ...locator, storageKey: { ...storageKey, PK: foreignPK } });
    vi.mocked(dynamodb.send).mockClear();
    expect(await createFinanceHandler()(transactionRequest)).toMatchObject({ statusCode: 404 });
    expect(
      vi
        .mocked(dynamodb.send)
        .mock.calls.some(
          ([command]) => command instanceof GetCommand && command.input.Key?.PK === foreignPK,
        ),
    ).toBe(false);
    store.set(locatorKey, locator);
    const sourceRow = store.get(keyOf(storageKey))!;
    const legacyBatch = '01J00000000000000000000889',
      legacyId = `${legacyBatch}:1`;
    const legacyKey = { PK: storageKey.PK, SK: `ROW#transactions#${legacyId}` };
    const legacyLocatorKey = `FINANCE#LOCATOR#transactions#${legacyId}`;
    const legacyRow = {
      ...sourceRow,
      ...legacyKey,
      entryKey: legacyId,
      data: {
        ...(sourceRow.data as Record<string, unknown>),
        id: legacyId,
        origin: 'csv',
        csvImportBatchId: legacyBatch,
        csvRowOrdinal: 1,
      },
    };
    store.set(keyOf(legacyKey), legacyRow);
    store.set(`${legacyLocatorKey}/CURRENT`, {
      PK: legacyLocatorKey,
      SK: 'CURRENT',
      storageKey: legacyKey,
    });
    const legacyRequest = event('GET', `/api/v1/finance/transactions/${legacyId}`);
    legacyRequest.headers['x-finance-cache-protocol'] = '1';
    expect(await createFinanceHandler()(legacyRequest)).toMatchObject({ statusCode: 200 });
    legacyRow.data.csvRowOrdinal = 2;
    expect(await createFinanceHandler()(legacyRequest)).toMatchObject({ statusCode: 404 });
    store.delete(keyOf(legacyKey));
    store.delete(`${legacyLocatorKey}/CURRENT`);
    const plainActivity = await createFinanceHandler()(
      event('GET', `/api/v1/finance/merchants/${merchant.id}`),
    );
    const snapshotRequest = event('GET', `/api/v1/finance/merchants/${merchant.id}`);
    snapshotRequest.headers['x-finance-cache-protocol'] = '1';
    const provenActivity = (await createFinanceHandler()(snapshotRequest)) as {
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    };
    expect(provenActivity.statusCode).toBe(200);
    expect(JSON.parse(provenActivity.body)).toEqual(bodyOf(plainActivity));
    expect(JSON.parse(provenActivity.body).transactions).toEqual([
      expect.objectContaining({ description: 'Synthetic private merchant activity' }),
    ]);
    expect(provenActivity.headers['x-finance-cache-proof']).toMatch(/^fc1\./u);
    const ownerMeta = store.get(keyOf({ PK: `FINANCE#SCOPE#OWNER#${actor.id}`, SK: 'META' }))!;
    ownerMeta.financeAuthorizationRevision =
      Number(ownerMeta.financeAuthorizationRevision ?? 0) + 1;
    const revokedPrivateActivity = await request({
      financeCacheProtocol: 1,
      financeCacheOnly: true,
      financeCacheProof: provenActivity.headers['x-finance-cache-proof'],
    });
    expect(revokedPrivateActivity.statusCode).toBe(200);
    expect(JSON.parse(revokedPrivateActivity.body).financeCache).toEqual({
      status: 'refresh-required',
    });
    expect(revokedPrivateActivity.body).not.toContain('Synthetic private merchant activity');
    const refreshedActivity = (await createFinanceHandler()(
      snapshotRequest,
    )) as typeof provenActivity;
    expect(refreshedActivity.statusCode).toBe(200);
    const repository = await DynamoFinanceRepository.forActor(actor);
    repository.merchants.delete(merchant.id);
    await repository.commit();
    const renewed = await request({
      financeCacheProtocol: 1,
      financeCacheOnly: true,
      financeCacheProof: body.financeCache.proof,
    });
    expect(renewed.statusCode).toBe(200);
    expect(JSON.parse(renewed.body).financeCache).toEqual({ status: 'refresh-required' });
    expect(renewed.body).not.toContain(merchant.name);
    const revokedActivity = await request({
      financeCacheProtocol: 1,
      financeCacheOnly: true,
      financeCacheProof: refreshedActivity.headers['x-finance-cache-proof'],
    });
    expect(revokedActivity.statusCode).toBe(200);
    expect(JSON.parse(revokedActivity.body).financeCache).toEqual({ status: 'refresh-required' });
  });

  it('rejects a stale tab expecting a different account before Finance reads or cache proof renewal', async () => {
    await createAccount();
    vi.mocked(dynamodb.send).mockClear();
    for (const path of ['/api/v1/finance/accounts', '/api/v1/sync/pull']) {
      const request = event(
        path.includes('/sync/') ? 'POST' : 'GET',
        path,
        path.includes('/sync/')
          ? { contractVersion: 8, financeCacheProtocol: 1, financeCacheOnly: true }
          : undefined,
      );
      request.headers['x-finance-owner'] = 'a-different-browser-account';
      const response = path.includes('/sync/')
        ? await syncHandler(request, {} as never, () => undefined)
        : await createFinanceHandler()(request);
      expect(response).toMatchObject({ statusCode: 401 });
      expect(JSON.stringify(response)).not.toContain(accountInput.organizationName);
    }
    expect(vi.mocked(dynamodb.send)).not.toHaveBeenCalled();
    const current = event('GET', '/api/v1/finance/accounts');
    current.headers['x-finance-owner'] = actor.id;
    expect(await createFinanceHandler()(current)).toMatchObject({ statusCode: 200 });
  });

  it('delivers a new manual account parent and immutable opening balance once through protected sync', async () => {
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'parent-feed-fixture-secret-'.repeat(4));
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    await createAccount();
    const result = (await syncHandler(
      event('POST', '/api/v1/sync/pull', {
        contractVersion: 8,
        financeCacheProtocol: 1,
        financeCursor: {},
        cursor: {},
      }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.financeState).toBe('ready');
    expect(body.financeCache.status).toBe('current');
    expect(body.financeChanges.map((change: { entityType: string }) => change.entityType)).toEqual([
      'financeAccount',
      'financeBalanceSnapshot',
    ]);
    expect(body.financeChanges[0]).toMatchObject({
      entityId: accountInput.id,
      version: 1,
      payload: { id: accountInput.id, version: 1 },
    });
    expect(body.financeChanges[1]).toMatchObject({
      version: 1,
      payload: {
        accountId: accountInput.id,
        effectiveAt: accountInput.balanceAt,
        recordedAt: accountInput.balanceAt,
      },
    });
    expect(body.financeChanges[1].payload).not.toHaveProperty('version');
    expect(balanceSnapshotSchema.safeParse(body.financeChanges[1].payload).success).toBe(true);
    expect(body.financeChanges[1].entityId).toBe(body.financeChanges[1].payload.id);
    expect(body.financeCursor.owner).toBe(2);
    const writes = transactions.length;
    const replay = await DynamoFinanceRepository.forActor(actor, 'create-account');
    await createManualAccount(replay, actor, accountInput, 'create-account');
    await replay.commit();
    expect(transactions).toHaveLength(writes);
    expect(
      [...store.values()].filter(
        (row) => row.PK === `FEED#OWNER#${actor.id}` && String(row.SK).startsWith('CHANGE#'),
      ),
    ).toHaveLength(2);
    // Measure the steady idle path used by the foreground scheduler. A cached
    // proof must not turn an empty page into whole-history source hydration.
    vi.mocked(dynamodb.send).mockClear();
    const idle = (await syncHandler(
      event('POST', '/api/v1/sync/pull', {
        contractVersion: 8,
        financeCacheProtocol: 1,
        cursor: body.financeCursor,
        financeCursor: body.financeCursor,
        financeCacheProof: body.financeCache.proof,
      }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(idle.statusCode).toBe(200);
    expect(JSON.parse(idle.body)).toMatchObject({
      financeChanges: [],
      financeState: 'ready',
      financeCache: { status: 'current' },
      financeCursor: body.financeCursor,
    });
    const commands = vi.mocked(dynamodb.send).mock.calls.map(([command]) => command);
    const snapshots = commands.filter((command) => command instanceof TransactGetCommand);
    const points = commands.filter((command) => command instanceof GetCommand);
    const feeds = commands.filter((command) => command instanceof QueryCommand);
    expect({
      snapshots: snapshots.length,
      securityItems: snapshots.reduce(
        (sum, command) => sum + command.input.TransactItems!.length,
        0,
      ),
      points: points.length,
      feeds: feeds.length,
      writes: commands.filter((command) => command instanceof TransactWriteCommand).length,
    }).toEqual({ snapshots: 3, securityItems: 9, points: 4, feeds: 3, writes: 0 });
    expect(points.every((command) => command.input.Key?.SK === 'META')).toBe(true);
    expect(
      feeds.every(
        (command) =>
          String(command.input.ExpressionAttributeValues?.[':pk']).startsWith('FEED#') &&
          command.input.Limit === 200,
      ),
    ).toBe(true);
  });

  it('issues opt-in REST snapshot evidence without changing legacy DTOs and detects later source revocation', async () => {
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'snapshot-fixture-secret-'.repeat(4));
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    await createAccount();
    const groupId = '01J00000000000000000000801';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const groupActor = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const groupRepository = await DynamoFinanceRepository.forActor(groupActor);
    await createManualAccount(
      groupRepository,
      groupActor,
      { ...accountInput, id: '01J00000000000000000000802', scope: { type: 'group', groupId } },
      'seed-snapshot-group',
    );
    await groupRepository.commit();
    const handler = createFinanceHandler();
    const plain = await handler(event('GET', '/api/v1/finance/accounts'));
    const request = event('GET', '/api/v1/finance/accounts');
    request.headers['x-finance-cache-protocol'] = '1';
    const response = (await handler(request)) as {
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    };
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe((plain as { body: string }).body);
    const proof = response.headers['x-finance-cache-proof'];
    expect(proof).toMatch(/^fc1[.]/u);
    expect(proof).not.toContain(accountInput.organizationName);
    const verify = async () => {
      const result = (await syncHandler(
        event('POST', '/api/v1/sync/pull', {
          contractVersion: 8,
          financeCacheProtocol: 1,
          financeCacheOnly: true,
          financeCacheProof: proof,
        }),
        {} as never,
        () => undefined,
      )) as { statusCode: number; body: string };
      expect(result.statusCode).toBe(200);
      return JSON.parse(result.body).financeCache;
    };
    expect((await verify()).status).toBe('current');
    accessState.memberships = [];
    expect((await verify()).status).toBe('refresh-required');
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    expect((await verify()).status).toBe('current');
    const meta = store.get(keyOf({ PK: `FINANCE#SCOPE#OWNER#${actor.id}`, SK: 'META' }))!;
    meta.financeAuthorizationRevision = Number(meta.financeAuthorizationRevision ?? 0) + 1;
    expect((await verify()).status).toBe('refresh-required');
  });
  it('issues real route proofs for budget, reusable and match views and withholds revoked match sources', async () => {
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'budget-route-proof-fixture-'.repeat(4));
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    await createAccount();
    const groupId = '01J00000000000000000000911';
    const budgetId = '01J00000000000000000000912';
    const itemId = '01J00000000000000000000913';
    const reusableId = '01J00000000000000000000914';
    const categoryId = '01J00000000000000000000915';
    const importBatchId = '01J00000000000000000000916';
    const transactionId = `${importBatchId}:1`;
    const matchId = '01J00000000000000000000917';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const member = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(member);
    repository.budgets.set(
      budgetId,
      createBudget({
        id: budgetId,
        groupId,
        name: 'Private budget',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
      }),
    );
    const itemInput = {
      description: 'Private planned item',
      financeCategoryId: categoryId,
      plannedAmountMinor: -1000,
      currency: 'USD',
      relatedAccountIds: [],
      creatorId: actor.id,
    };
    repository.budgetItems.set(itemId, createBudgetItem({ ...itemInput, id: itemId, budgetId }));
    repository.reusableItems.set(
      reusableId,
      createReusableBudgetItem({
        ...itemInput,
        id: reusableId,
        groupId,
        applicableDate: '2026-01-15',
      }),
    );
    repository.transactions.push(
      createFinancialTransaction({
        id: transactionId,
        accountId: accountInput.id,
        origin: 'csv',
        amountMinor: -1000,
        currency: 'USD',
        transactedAt: '2026-01-15T00:00:00Z',
        description: 'Owner purchase',
        pending: false,
        connectedAccount: false,
        csvImportBatchId: importBatchId,
        csvRowOrdinal: 1,
      }),
    );
    repository.transactionMatches.set(
      matchId,
      createTransactionMatch({
        id: matchId,
        transactionId,
        budgetItemId: itemId,
        kind: 'near',
        scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 0 },
      }),
    );
    await repository.commit();
    const handler = createFinanceHandler();
    const read = (path: string) => {
      const request = event('GET', `/api/v1/finance/${path}`);
      request.headers['x-finance-cache-protocol'] = '1';
      return handler(request) as Promise<{
        statusCode: number;
        body: string;
        headers: Record<string, string>;
      }>;
    };
    const encoded = encodeURIComponent(transactionId);
    const paths = [
      'budgets',
      `budgets/${budgetId}`,
      `budgets/${budgetId}/reusable-offers`,
      'reusable-items',
      `transactions/${encoded}/matches`,
      `records/reusable-item/${reusableId}/deletion-preview`,
      `records/match/${matchId}/deletion-preview`,
      `records/transaction/${encoded}/deletion-preview`,
      `records/account/${accountInput.id}/deletion-preview`,
    ];
    for (const path of paths) {
      const response = await read(path);
      expect(response.statusCode, path).toBe(200);
      expect(response.headers['x-finance-cache-proof'], path).toMatch(/^fc1[.]/u);
    }
    const matchView = await read(`transactions/${encoded}/matches`);
    expect(bodyOf(matchView).items).toMatchObject([{ id: matchId, budgetItemId: itemId }]);
    const verify = async () =>
      bodyOf(
        await syncHandler(
          event('POST', '/api/v1/sync/pull', {
            contractVersion: 8,
            financeCacheProtocol: 1,
            financeCacheOnly: true,
            financeCacheProof: matchView.headers['x-finance-cache-proof'],
          }),
          {} as never,
          () => undefined,
        ),
      ).financeCache;
    expect(await verify()).toMatchObject({ status: 'current' });
    accessState.memberships = [];
    expect(await verify()).toMatchObject({ status: 'refresh-required' });
    expect(bodyOf(await read(`transactions/${encoded}/matches`)).items).toEqual([]);
    expect(bodyOf(await read('reusable-items')).items).toEqual([]);
    expect(await read(`records/match/${matchId}/deletion-preview`)).toMatchObject({
      statusCode: 404,
    });
    expect(await read(`records/transaction/${encoded}/deletion-preview`)).toMatchObject({
      statusCode: 200,
    });
  });

  it.each([
    ['POST', '/api/v1/finance/accounts', '1'],
    ['GET', '/api/v1/finance/queries', '1'],
    ['GET', '/api/v1/finance/accounts', '2'],
  ])(
    'rejects unsupported REST snapshot opt-in %s %s protocol %s',
    async (method, path, protocol) => {
      const request = event(method, path);
      request.headers['x-finance-cache-protocol'] = protocol;
      const response = await createFinanceHandler()(request);
      expect((response as { statusCode: number }).statusCode).toBe(400);
      expect(bodyOf(response).code).toBe('invalid_finance_snapshot');
      expect(transactions).toHaveLength(0);
    },
  );

  it('replays a protected budget edit once and binds the saved result to its exact intent', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const groupId = '01J00000000000000000000901',
      budgetId = '01J00000000000000000000902',
      mutationId = '01J00000000000000000000903';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const owner = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(owner);
    await createFinanceBudget(
      repository,
      owner,
      {
        id: budgetId,
        groupId,
        name: 'Before',
        budgetDate: '2026-11-07',
        startDate: '2026-11-07',
        status: 'active',
      },
      'seed-budget',
    );
    await repository.commit();
    const mutation = {
      id: mutationId,
      entityId: budgetId,
      entityType: 'financeBudget',
      operation: 'update',
      baseVersion: 1,
      payload: { name: 'Saved offline edit' },
      createdAt: '2026-11-07T00:00:00Z',
      attempts: 0,
    };
    const request = (value = mutation) =>
      syncHandler(
        event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [value] }),
        {} as never,
        () => undefined,
      ) as Promise<{ statusCode: number; body: string }>;
    vi.mocked(dynamodb.send).mockClear();
    const first = JSON.parse((await request()).body).results[0];
    expect(first).toMatchObject({ mutationId, status: 'applied', version: 2 });
    expect(JSON.stringify(first)).not.toContain('Saved offline edit');
    const writes = transactions.length;
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({
      status: 'alreadyApplied',
      version: 2,
    });
    expect(transactions).toHaveLength(writes);
    expect(
      JSON.parse((await request({ ...mutation, payload: { name: 'Different intent' } })).body)
        .results[0].status,
    ).toBe('conflict');
    expect(transactions).toHaveLength(writes);
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
    const loaded = await DynamoFinanceRepository.forActor(owner);
    expect(loaded.budgets.get(budgetId)).toMatchObject({ name: 'Saved offline edit', version: 2 });
    const receipt = [...store.values()].find((row) => row.requestFingerprint !== undefined)!;
    expect(receipt.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    delete receipt.requestFingerprint; // Legacy saved results cannot prove this replay's exact intent.
    expect(JSON.parse((await request()).body).results[0].status).toBe('conflict');
    expect(transactions).toHaveLength(writes);
    const malformed = event('GET', `/api/v1/finance/budgets/${budgetId}`);
    malformed.headers['x-finance-sync-replay'] = 'budget-edit-v1';
    expect(((await createFinanceHandler()(malformed)) as { statusCode: number }).statusCode).toBe(
      400,
    );
    const locatorKey = keyOf({ PK: `FINANCE#LOCATOR#budgets#${budgetId}`, SK: 'CURRENT' });
    const locator = structuredClone(store.get(locatorKey)!);
    store.delete(locatorKey);
    vi.mocked(dynamodb.send).mockClear();
    expect(JSON.parse((await request()).body).results[0].status).toBe('retry');
    expect(transactions).toHaveLength(writes);
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
    const foreignPK = 'FINANCE#SCOPE#GROUP#01J00000000000000000000999';
    store.set(locatorKey, {
      ...locator,
      storageKey: { ...(locator.storageKey as object), PK: foreignPK },
    });
    vi.mocked(dynamodb.send).mockClear();
    expect(JSON.parse((await request()).body).results[0].status).toBe('conflict');
    expect(transactions).toHaveLength(writes);
    expect(
      vi
        .mocked(dynamodb.send)
        .mock.calls.some(
          ([command]) => command instanceof GetCommand && command.input.Key?.PK === foreignPK,
        ),
    ).toBe(false);
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
  });
  it('creates a queued budget with its stable ID once and binds retries to the exact intent', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const groupId = '01J00000000000000000000921',
      budgetId = '01J00000000000000000000922',
      mutationId = '01J00000000000000000000923';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const groupPK = `FINANCE#SCOPE#GROUP#${groupId}`;
    store.set(keyOf({ PK: groupPK, SK: 'META' }), {
      PK: groupPK,
      SK: 'META',
      revision: 1,
      financeAuthorizationRevision: 0,
    });
    const mutation = {
      id: mutationId,
      entityId: budgetId,
      entityType: 'financeBudget',
      operation: 'create',
      baseVersion: 0,
      payload: {
        id: budgetId,
        groupId,
        name: 'Queued household budget',
        budgetDate: '2026-12-01',
        startDate: '2026-12-01',
        status: 'draft',
        version: 1,
      },
      createdAt: '2026-11-07T00:00:00Z',
      attempts: 0,
    } as const;
    const request = (value = mutation) =>
      syncHandler(
        event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [value] }),
        {} as never,
        () => undefined,
      ) as Promise<{ statusCode: number; body: string }>;
    vi.mocked(dynamodb.send).mockClear();
    const first = JSON.parse((await request()).body).results[0];
    expect(first).toMatchObject({ mutationId, status: 'applied', version: 1 });
    expect(JSON.stringify(first)).not.toContain('Queued household budget');
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
    const writes = transactions.length;
    const canonicalSK = `ROW#budgets#${createHash('sha256').update(budgetId).digest('hex')}`;
    const canonicalKey = keyOf({ PK: groupPK, SK: canonicalSK });
    expect(store.get(canonicalKey)?.data).toMatchObject({
      id: budgetId,
      groupId,
      name: 'Queued household budget',
      version: 1,
    });
    expect(
      store.get(keyOf({ PK: `FINANCE#LOCATOR#budgets#${budgetId}`, SK: 'CURRENT' }))?.storageKey,
    ).toEqual({ PK: groupPK, SK: canonicalSK });
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({
      status: 'alreadyApplied',
      version: 1,
    });
    expect(transactions).toHaveLength(writes);
    expect(
      JSON.parse(
        (
          await request({
            ...mutation,
            payload: { ...mutation.payload, name: 'Different queued intent' },
          })
        ).body,
      ).results[0].status,
    ).toBe('conflict');
    expect(transactions).toHaveLength(writes);
    const receipt = [...store.values()].find((row) => row.requestFingerprint !== undefined);
    expect(receipt?.requestFingerprint).toMatch(/^[a-f0-9]{64}$/u);
    const direct = event(
      'POST',
      `/api/v1/finance/budgets/${budgetId}`,
      mutation.payload,
      mutationId,
    );
    expect(((await createFinanceHandler()(direct)) as { statusCode: number }).statusCode).toBe(400);
    expect(transactions).toHaveLength(writes);
  });
  it('replays a stable budget account link using only point-read uniqueness evidence', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const groupId = '01J00000000000000000000931',
      budgetId = '01J00000000000000000000932',
      accountId = '01J00000000000000000000933',
      linkId = '01J00000000000000000000934',
      mutationId = '01J00000000000000000000935';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const owner = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(owner);
    await createManualAccount(
      repository,
      owner,
      {
        id: accountId,
        scope: { type: 'group', groupId },
        sourceName: 'Link replay account',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-11-12T00:00:00.000Z',
      },
      'seed-link-account',
    );
    await createFinanceBudget(
      repository,
      owner,
      {
        id: budgetId,
        groupId,
        name: 'Link replay budget',
        budgetDate: '2026-11-12',
        startDate: '2026-11-12',
        status: 'active',
      },
      'seed-link-budget',
    );
    await repository.commit();
    const groupMetaKey = keyOf({ PK: `FINANCE#SCOPE#GROUP#${groupId}`, SK: 'META' });
    const mutation = {
      id: mutationId,
      entityId: linkId,
      entityType: 'financeBudgetAccountLink',
      operation: 'create',
      baseVersion: 0,
      payload: {
        id: linkId,
        budgetId,
        accountId,
        expectedBudgetVersion: 1,
        createdBy: 'pending',
        status: 'active',
        version: 1,
      },
      createdAt: '2026-11-12T00:00:00Z',
      attempts: 0,
    } as const;
    const request = () =>
      syncHandler(
        event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [mutation] }),
        {} as never,
        () => undefined,
      ) as Promise<{ statusCode: number; body: string }>;
    vi.mocked(dynamodb.send).mockClear();
    const beforeCoverage = transactions.length;
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({ status: 'retry' });
    expect(transactions).toHaveLength(beforeCoverage);
    expect(
      vi
        .mocked(dynamodb.send)
        .mock.calls.some(
          ([command]) =>
            command instanceof GetCommand && String(command.input.Key?.SK).startsWith('ROW#'),
        ),
    ).toBe(false);
    store.set(groupMetaKey, {
      ...store.get(groupMetaKey),
      budgetAccountLinkIndexVersion: 1,
    });
    vi.mocked(dynamodb.send).mockClear();
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({
      mutationId,
      status: 'applied',
      version: 1,
    });
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
    expect(store.get(keyOf(financeBudgetAccountPairKey(budgetId, accountId)))).toMatchObject({
      linkId,
    });
    const writes = transactions.length;
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({
      status: 'alreadyApplied',
      version: 1,
    });
    expect(transactions).toHaveLength(writes);
    const competing = {
      ...mutation,
      id: '01J00000000000000000000936',
      entityId: '01J00000000000000000000937',
      payload: {
        ...mutation.payload,
        id: '01J00000000000000000000937',
        expectedBudgetVersion: 2,
      },
    };
    const duplicate = await syncHandler(
      event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [competing] }),
      {} as never,
      () => undefined,
    );
    expect(JSON.parse((duplicate as { body: string }).body).results[0]).toMatchObject({
      mutationId: competing.id,
      status: 'conflict',
    });
    expect(transactions).toHaveLength(writes);
  });
  it('replays a stable budget item from bounded parent, catalog and active-link evidence', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const groupId = '01J00000000000000000000941',
      budgetId = '01J00000000000000000000942',
      accountId = '01J00000000000000000000943',
      linkId = '01J00000000000000000000944',
      categoryId = '01J00000000000000000000945',
      itemId = '01J00000000000000000000946',
      mutationId = '01J00000000000000000000947';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const owner = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(owner);
    repository.categories.set(
      categoryId,
      createUserFinanceCategory({ id: categoryId, name: 'Replay category', creatorId: actor.id }),
    );
    await createManualAccount(
      repository,
      owner,
      {
        id: accountId,
        scope: { type: 'group', groupId },
        sourceName: 'Item replay account',
        organizationName: 'Fixture Bank',
        accountType: 'checking',
        currency: 'USD',
        openingBalanceMinor: 0,
        balanceAt: '2026-11-13T00:00:00.000Z',
      },
      'seed-item-account',
    );
    const budget = await createFinanceBudget(
      repository,
      owner,
      {
        id: budgetId,
        groupId,
        name: 'Item replay budget',
        budgetDate: '2026-11-13',
        startDate: '2026-11-13',
        status: 'active',
      },
      'seed-item-budget',
    );
    await linkFinanceBudgetAccount(
      repository,
      owner,
      budgetId,
      { id: linkId, accountId, expectedBudgetVersion: budget.version },
      'seed-item-link',
    );
    await repository.commit();
    const groupMetaKey = keyOf({ PK: `FINANCE#SCOPE#GROUP#${groupId}`, SK: 'META' });
    store.set(groupMetaKey, {
      ...store.get(groupMetaKey),
      budgetAccountLinkIndexVersion: 1,
    });
    const mutation = {
      id: mutationId,
      entityId: itemId,
      entityType: 'financeBudgetItem',
      operation: 'create',
      baseVersion: 0,
      payload: {
        id: itemId,
        budgetId,
        expectedBudgetVersion: 2,
        description: 'Queued rent',
        financeCategoryId: categoryId,
        plannedAmountMinor: -125000,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [accountId],
        creatorId: 'pending',
        status: 'active',
        version: 1,
      },
      createdAt: '2026-11-13T00:00:00Z',
      attempts: 0,
    } as const;
    const request = () =>
      syncHandler(
        event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [mutation] }),
        {} as never,
        () => undefined,
      ) as Promise<{ statusCode: number; body: string }>;
    const pairKey = keyOf(financeBudgetAccountPairKey(budgetId, accountId));
    const pair = store.get(pairKey)!;
    store.delete(pairKey);
    const writes = transactions.length;
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({ status: 'conflict' });
    expect(transactions).toHaveLength(writes);
    store.set(pairKey, pair);
    vi.mocked(dynamodb.send).mockClear();
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({
      mutationId,
      status: 'applied',
      version: 1,
    });
    expect(
      vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
    ).toBe(false);
    expect(
      [...store.values()].find((row) => row.collection === 'budgetItems' && row.entryKey === itemId)
        ?.data,
    ).toMatchObject({ id: itemId, budgetId, relatedAccountIds: [accountId], version: 1 });
    const committed = transactions.length;
    expect(JSON.parse((await request()).body).results[0]).toMatchObject({
      status: 'alreadyApplied',
      version: 1,
    });
    expect(transactions).toHaveLength(committed);
  });
  it('retains stale-version or interrupted-session budget intent and safely resumes an already committed edit', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const groupId = '01J00000000000000000000911',
      budgetId = '01J00000000000000000000912',
      mutationId = '01J00000000000000000000913';
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    const owner = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(owner);
    await createFinanceBudget(
      repository,
      owner,
      {
        id: budgetId,
        groupId,
        name: 'Before',
        budgetDate: '2026-11-07',
        startDate: '2026-11-07',
        status: 'active',
      },
      'seed-budget',
    );
    await repository.commit();
    const mutation = {
      id: mutationId,
      entityId: budgetId,
      entityType: 'financeBudget',
      operation: 'update',
      baseVersion: 1,
      payload: { name: 'Committed before interruption' },
      createdAt: '2026-11-07T00:00:00Z',
      attempts: 0,
    };
    const sessionKey = { PK: `SESSION#${'a'.repeat(64)}`, SK: 'SESSION' },
      session = structuredClone(store.get(keyOf(sessionKey))!);
    const original = vi.mocked(dynamodb.send).getMockImplementation()!;
    let interrupt = true;
    vi.mocked(dynamodb.send).mockImplementation((async (command: unknown) => {
      const result = await (original as (command: unknown) => Promise<unknown>)(command);
      if (interrupt && command instanceof TransactWriteCommand) {
        interrupt = false;
        store.delete(keyOf(sessionKey));
      }
      return result;
    }) as typeof dynamodb.send);
    const incoming = event('POST', '/api/v1/sync/push', {
      contractVersion: 8,
      mutations: [mutation],
    });
    const response = (await syncHandler(incoming, {} as never, () => undefined)) as {
      body: string;
    };
    expect(JSON.parse(response.body).results[0].status).toBe('retry');
    expect((await DynamoFinanceRepository.forActor(owner)).budgets.get(budgetId)?.version).toBe(2);
    const newHash = 'b'.repeat(64);
    store.set(keyOf({ PK: `SESSION#${newHash}`, SK: 'SESSION' }), {
      ...session,
      PK: `SESSION#${newHash}`,
      data: { ...(session.data as object), id: 'fresh-finance-session' },
    });
    const fresh = {
      ...incoming,
      requestContext: {
        ...incoming.requestContext,
        authorizer: {
          lambda: { userId: actor.id, role: 'user', csrfToken: 'csrf', sessionHash: newHash },
        },
      },
    } as APIGatewayProxyEventV2;
    const writes = transactions.length;
    const replayed = (await syncHandler(fresh, {} as never, () => undefined)) as { body: string };
    expect(JSON.parse(replayed.body).results[0].status).toBe('alreadyApplied');
    expect(transactions).toHaveLength(writes);
    const stale = {
      ...fresh,
      body: JSON.stringify({
        contractVersion: 8,
        mutations: [{ ...mutation, id: '01J00000000000000000000914' }],
      }),
    };
    expect(
      JSON.parse(
        ((await syncHandler(stale, {} as never, () => undefined)) as { body: string }).body,
      ).results[0].status,
    ).toBe('conflict');
    expect(transactions).toHaveLength(writes);
  });
  it('withholds a prepared legacy HTTP read after a canonical scope revision changes without rehydrating it', async () => {
    await createAccount();
    let checks = 0;
    let beforeRecheck = 0;
    const authorize = async () => {
      if (++checks === 2) {
        const key = keyOf({ PK: `FINANCE#SCOPE#OWNER#${actor.id}`, SK: 'META' });
        const current = store.get(key)!;
        store.set(key, { ...current, revision: Number(current.revision) + 1 });
        beforeRecheck = vi.mocked(dynamodb.send).mock.calls.length;
      }
      return { requirePin: false, securityRevision: 0, sessionEpoch: 0 };
    };
    const response = await createFinanceHandler(
      undefined,
      authorize,
    )(event('GET', `/api/v1/finance/accounts/${accountInput.id}`));
    expect(response).toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(bodyOf(response))).not.toContain(accountInput.sourceName);
    const rechecks = vi
      .mocked(dynamodb.send)
      .mock.calls.slice(beforeRecheck)
      .map(([command]) => command);
    expect(rechecks.length).toBeGreaterThan(0);
    expect(
      rechecks.every(
        (command) =>
          command instanceof GetCommand &&
          command.input.ConsistentRead === true &&
          command.input.Key?.SK === 'META',
      ),
    ).toBe(true);
    expect(
      await createFinanceHandler()(event('GET', `/api/v1/finance/accounts/${accountInput.id}`)),
    ).toMatchObject({ statusCode: 200 });
  });

  it('withholds a prepared group Finance response if active membership disappears before delivery', async () => {
    const groupId = '01J00000000000000000000829';
    const member = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(member);
    await createManualAccount(
      repository,
      member,
      { ...accountInput, scope: { type: 'group', groupId } },
      'group-account',
    );
    await repository.commit();
    accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
    let checks = 0;
    const authorize = async () => {
      if (++checks === 2) accessState.canonicalMemberships = [];
      return { requirePin: false, securityRevision: 0, sessionEpoch: 0 };
    };
    const response = await createFinanceHandler(
      undefined,
      authorize,
    )(event('GET', `/api/v1/finance/accounts/${accountInput.id}`));
    expect(response).toMatchObject({ statusCode: 403 });
    expect(JSON.stringify(bodyOf(response))).not.toMatch(
      new RegExp(`${accountInput.id}|${groupId}|Checking`),
    );
    expect(
      await createFinanceHandler()(event('GET', `/api/v1/finance/accounts/${accountInput.id}`)),
    ).toMatchObject({ statusCode: 404 });
  });

  it('commits a durable publication request and revision journal with a legacy mutation and replays without duplication', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', 'default');
    const events = vi.spyOn(EventBridgeClient.prototype, 'send').mockImplementation(async () => {
      expect([...store.values()].some((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')).toBe(true);
      return { FailedEntryCount: 0, Entries: [{ EventId: 'event' }] };
    });
    const repository = await DynamoFinanceRepository.forActor(actor);
    await createManualAccount(repository, actor, accountInput, 'journal-account');
    await repository.commit();
    const request = [...store.values()].find((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX');
    expect(store.get(`FINANCE#SCOPE#OWNER#${actor.id}/META`)?.refundRelationshipIndexVersion).toBe(
      1,
    );
    expect(request).toMatchObject({
      state: 'pending',
      changes: expect.arrayContaining([
        expect.objectContaining({ collection: 'accounts', sourceId: accountInput.id }),
      ]),
    });
    const committed = transactions.at(-1)!.input.TransactItems!;
    expect(committed.some((entry) => entry.Put?.Item?.PK === 'FINANCE#PUBLICATION_OUTBOX')).toBe(
      true,
    );
    expect(
      committed.some((entry) => String(entry.Put?.Item?.SK).startsWith('PUBLICATION_CHANGE#')),
    ).toBe(true);
    const before = transactions.length;
    const retry = await DynamoFinanceRepository.forActor(actor, 'journal-account');
    await createManualAccount(retry, actor, accountInput, 'journal-account');
    await retry.commit();
    expect(transactions).toHaveLength(before);
    expect(
      [...store.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(1);
    const account = repository.accounts.get(accountInput.id)!;
    repository.accounts.set(account.id, {
      ...account,
      sourceName: 'Changed',
      version: account.version + 1,
    });
    await repository.commit();
    expect(store.get(`FINANCE#SCOPE#OWNER#${actor.id}/META`)?.refundRelationshipIndexVersion).toBe(
      1,
    );
    expect(events).toHaveBeenCalledTimes(2);
    const birthKey = `FINANCE#PUBLICATION_ACCOUNT_BIRTH#${account.id}/CURRENT`;
    const firstBirth = store.get(birthKey)!;
    expect(firstBirth).toMatchObject({
      format: 'finance-publication-account-birth-v1',
      accountId: account.id,
    });
    repository.balanceSnapshots.splice(0, repository.balanceSnapshots.length);
    repository.accounts.delete(account.id);
    await repository.commit();
    const deathKey = `FINANCE#PUBLICATION_ACCOUNT_DELETION#${account.id}/CURRENT`;
    const firstDeath = store.get(deathKey)!;
    expect(firstDeath).toMatchObject({ accountId: account.id, beforeVersion: account.version + 1 });
    repository.accounts.set(account.id, { ...account, version: 1 });
    await repository.commit();
    expect(store.get(birthKey)?.publicationId).not.toBe(firstBirth.publicationId);
    repository.accounts.delete(account.id);
    await repository.commit();
    expect(store.get(deathKey)).toMatchObject({ accountId: account.id, beforeVersion: 1 });
    expect(store.get(deathKey)?.publicationId).not.toBe(firstDeath.publicationId);
    await expect(DynamoFinanceRepository.forActor(actor, 'journal-account')).rejects.toMatchObject({
      status: 409,
      code: 'finance_mutation_sources_changed',
    });
    const writesBeforeReplay = transactions.length;
    const replayResponse = await createFinanceHandler()(
      event(
        'POST',
        '/api/v1/finance/accounts',
        Object.fromEntries(Object.entries(accountInput).filter(([key]) => key !== 'id')),
        'journal-account',
      ),
    );
    expect(replayResponse).toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(bodyOf(replayResponse))).not.toContain(accountInput.sourceName);
    expect(transactions.length).toBe(writesBeforeReplay);
  });

  it('does not leave publication metadata behind a failed legacy canonical commit', async () => {
    const repository = await DynamoFinanceRepository.forActor(actor);
    await createManualAccount(repository, actor, accountInput, 'journal-outage');
    failCommit = true;
    await expect(repository.commit()).rejects.toThrow(/storage outage/i);
    expect(
      [...store.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(0);
    expect(
      [...store.values()].filter((row) => String(row.SK).startsWith('ROW#accounts#')),
    ).toHaveLength(0);
    failCommit = false;
    await repository.commit();
    expect(
      [...store.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(1);
  });
  it('preserves shared catalog references held only in another authorized scope', async () => {
    const categoryId = '01J00000000000000000000826';
    const scopePK = `FINANCE#SCOPE#OWNER#${actor.id}`;
    const metaKey = { PK: scopePK, SK: 'META' };
    store.set(keyOf(metaKey), { ...metaKey, revision: 1, refundRelationshipIndexVersion: 1 });
    const privateKey = { PK: scopePK, SK: 'ROW#refundRelationships#synthetic' };
    const privateRow = {
      ...privateKey,
      collection: 'refundRelationships',
      entryKey: 'synthetic-credit',
      data: { privateReference: 'preserved-server-only' },
    };
    store.set(keyOf(privateKey), privateRow);
    const repository = await DynamoFinanceRepository.forActor(actor);
    repository.categories.set(
      categoryId,
      createUserFinanceCategory({ id: categoryId, name: 'Fixture category', creatorId: actor.id }),
    );
    await createManualAccount(repository, actor, accountInput, 'protocol-preservation');
    await repository.commit();
    expect(store.get(keyOf(metaKey))).toMatchObject({ refundRelationshipIndexVersion: 1 });
    expect(store.get(keyOf(privateKey))).toEqual(privateRow);
    expect(JSON.stringify(repository)).not.toContain('preserved-server-only');
    const groupId = '01J00000000000000000000821';
    const other = {
      ...actor,
      id: 'other',
      groupMemberships: [{ groupId, role: 'member' as const }],
    };
    const second = await DynamoFinanceRepository.forActor(other);
    const budgetId = '01J00000000000000000000822';
    const itemId = '01J00000000000000000000823';
    second.budgets.set(
      budgetId,
      createBudget({
        id: budgetId,
        groupId,
        name: 'Fixture plan',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
      }),
    );
    second.budgetItems.set(
      itemId,
      createBudgetItem({
        id: itemId,
        budgetId,
        description: 'Fixture bill',
        financeCategoryId: categoryId,
        plannedAmountMinor: -1000,
        currency: 'USD',
        relatedAccountIds: [],
        creatorId: other.id,
      }),
    );
    await second.commit();
    const fresh = await DynamoFinanceRepository.forActor(actor);
    expect(fresh.budgetItems.size).toBe(0);
    expect(fresh.catalogReferenced('category', categoryId)).toBe(true);
    const request = event('GET', `/api/v1/finance/records/category/${categoryId}/deletion-preview`);
    request.headers['x-finance-cache-protocol'] = '1';
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'catalog-removal-proof-fixture-'.repeat(4));
    const response = await createFinanceHandler()(request);
    expect(response).toMatchObject({
      statusCode: 200,
      headers: { 'x-finance-cache-proof': expect.stringMatching(/^fc1[.]/u) },
    });
    const preview = bodyOf(response);
    expect(preview.outcome).toBe('archive');
    expect(JSON.stringify(preview)).not.toContain(itemId);
  });

  it('hides protected mutation receipts after group access is revoked', async () => {
    const groupId = '01J00000000000000000000821';
    const member = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(member);
    await createFinanceBudget(
      repository,
      member,
      {
        id: '01J00000000000000000000822',
        groupId,
        name: 'Fixture plan',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
      },
      'budget-create',
    );
    await repository.commit();
    expect(
      (await DynamoFinanceRepository.forActor(member, 'budget-create')).mutation(
        actor.id,
        'budget-create',
      ),
    ).toBeDefined();
    await expect(DynamoFinanceRepository.forActor(actor, 'budget-create')).rejects.toMatchObject({
      status: 409,
      code: 'finance_mutation_sources_changed',
    });
  });

  it('retains group budget completeness without revealing a linked private account to another member', async () => {
    const groupId = '01J00000000000000000000821';
    const member = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(member);
    await createManualAccount(repository, member, accountInput, 'account-create');
    const budget = await createFinanceBudget(
      repository,
      member,
      {
        id: '01J00000000000000000000822',
        groupId,
        name: 'Fixture plan',
        status: 'active',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
      },
      'budget-create',
    );
    await linkFinanceBudgetAccount(
      repository,
      member,
      budget.id,
      {
        id: '01J00000000000000000000823',
        accountId: accountInput.id,
        expectedBudgetVersion: budget.version,
      },
      'link-account',
    );
    const item = createBudgetItem({
      id: '01J00000000000000000000824',
      budgetId: budget.id,
      description: 'Shared plan',
      financeCategoryId: '01J00000000000000000000825',
      plannedAmountMinor: -4500,
      currency: 'USD',
      relatedAccountIds: [accountInput.id],
      creatorId: actor.id,
    });
    repository.budgetItems.set(item.id, item);
    repository.transactions.push(
      replaceTransactionAllocations(
        createFinancialTransaction({
          id: '01J00000000000000000000826',
          accountId: accountInput.id,
          origin: 'manual',
          amountMinor: -4500,
          currency: 'USD',
          transactedAt: '2026-01-02T00:00:00Z',
          description: 'Synthetic private spending',
          pending: false,
          connectedAccount: false,
        }),
        [
          {
            id: '01J00000000000000000000827',
            amountMinor: -4500,
            financeCategoryId: item.financeCategoryId,
            budgetItemId: item.id,
          },
        ],
        actor.id,
      ),
    );
    const record = await reconcileFinanceBudget(
      repository,
      member,
      budget.id,
      {
        id: '01J00000000000000000000828',
        expectedVersion: repository.budgets.get(budget.id)!.version,
      },
      'reconcile-private',
    );
    await repository.commit();
    const stored = [...store.values()].find(
      (row) => row.collection === 'budgetReconciliations' && row.entryKey === record.id,
    )!;
    expect(stored.financeSourceAccountIds).toEqual([accountInput.id]);
    expect(stored.data).not.toHaveProperty('financeSourceAccountIds');
    const ownerView = await DynamoFinanceRepository.forActor(member);
    expect(listBudgetReconciliationHistory(ownerView, member, budget.id)).toEqual([record]);
    const other = { ...member, id: 'other-member' };
    const fresh = await DynamoFinanceRepository.forActor(other);
    const view = getFinanceBudget(fresh, other, budget.id);
    expect(view.totalsComplete).toBe(false);
    expect(view.accountLinks).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(accountInput.id);
  });

  it('restores receipt bytes, fulfillment and task references together after retried provider reconciliation', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const id = (ordinal: number) => `01J${String(ordinal).padStart(23, '0')}`;
    const now = '2026-01-05T12:00:00.000Z';
    const groupId = id(860);
    const member = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
    const repository = await DynamoFinanceRepository.forActor(member);
    const account = await createManualAccount(repository, member, accountInput, 'create-account');
    repository.connections.set('connection-a', { id: 'connection-a', scope: account.scope });
    repository.accounts.set(account.id, { ...account, connectionId: 'connection-a' });
    const budget = createBudget({
      id: id(861),
      groupId,
      name: 'Fixture budget',
      budgetDate: '2026-01-01',
      startDate: '2026-01-01',
      status: 'active',
    });
    repository.budgets.set(budget.id, budget);
    const expense = createUpcomingExpense({
      id: id(862),
      groupId,
      budgetId: budget.id,
      accountId: accountInput.id,
      description: 'Fixture bill',
      expectedAmountMinor: 1000,
      currency: 'USD',
      dueDate: '2026-01-10',
      creatorId: actor.id,
      acceptedAt: now,
      entryContext: { localDate: '2026-01-05', timeZone: 'America/Denver', enteredAt: now },
    });
    repository.upcomingExpenses.set(expense.id, expense);

    const transaction = {
      accountId: accountInput.id,
      amountMinor: -1000,
      currency: 'USD',
      description: 'Fixture bill',
      pending: false,
      connectedAccount: true,
    } as const;
    const provisional = createFinancialTransaction({
      ...transaction,
      id: id(863),
      origin: 'manual',
      transactedAt: now,
    });
    const candidate = createFinancialTransaction({
      ...transaction,
      id: id(864),
      origin: 'simplefin',
      postedAt: now,
      providerConnectionId: 'connection-a',
      providerAccountId: 'provider-account-a',
      sourceTransactionId: 'provider-transaction-a',
    });
    repository.transactions.push(provisional, candidate);
    repository.claimSourceIdentity(
      'connection-a',
      'connection-a:provider-account-a:provider-transaction-a',
      candidate.id,
    );
    const target = (targetId: string) => ({ targetType: 'transaction' as const, targetId });
    const { task, link } = createTaskFromFinanceTarget(
      repository,
      member,
      target(candidate.id),
      { taskId: id(865), linkId: id(866), label: 'Review receipt', assigneeId: actor.id },
      'link-task',
    );
    const duplicate = createTaskFromFinanceTarget(
      repository,
      member,
      target(candidate.id),
      { taskId: id(871), linkId: id(872), label: 'Compare receipts', assigneeId: actor.id },
      'link-second-task',
    );
    const canonicalLink = createAuthorizedFinancialTaskLink(
      repository,
      member,
      duplicate.taskId,
      target(provisional.id),
      id(873),
      duplicate.task.version,
    );
    const fulfillmentInput = {
      id: id(867),
      transactionId: candidate.id,
      amountMinor: 1000,
      expectedExpenseVersion: expense.version,
      expectedTransactionVersion: candidate.version,
      expectedClaimVersion: 0,
    };
    const originalFulfillment = linkUpcomingExpenseFulfillment(
      repository,
      member,
      expense.id,
      fulfillmentInput,
      'link-payment',
    );
    await repository.commit();

    const bytes = Buffer.from('fixture receipt bytes');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const receipt = attachmentSchema.parse({
      id: id(868),
      blobId: id(869),
      parentType: 'financeTransaction',
      parentId: candidate.id,
      originalFilename: 'receipt.pdf',
      sizeBytes: bytes.length,
      mediaType: 'application/pdf',
      checksumSha256: checksum,
      uploaderId: actor.id,
      status: 'available',
      version: 3,
      createdAt: now,
      updatedAt: now,
    });
    const blob = attachmentBlobSchema.parse({
      blobId: receipt.blobId,
      attachmentId: receipt.id,
      objectKey: 'attachments/' + receipt.blobId,
      objectVersionId: 'verified-version',
      sizeBytes: bytes.length,
      checksumSha256: checksum,
      encryptionKeyArn: 'fixture-key',
      scanStatus: 'clean',
      lifecycle: 'clean',
      receiptChecks: {
        objectETag: '"fixture-etag"',
        policyCleanVersion: 'verified-version',
        malwareCleanVersion: 'verified-version',
      },
      createdAt: now,
      updatedAt: now,
    });
    const oldTargetKey = financeKeys.financialTaskTargetLink('transaction', candidate.id, link.id);
    const newTargetKey = financeKeys.financialTaskTargetLink('transaction', provisional.id, link.id);
    const oldPairKey = financeKeys.financialTaskPair(task.id, 'transaction', candidate.id);
    const newPairKey = financeKeys.financialTaskPair(task.id, 'transaction', provisional.id);
    const reverseKey = financeKeys.financialTaskReverseLink(task.id, link.id);
    const attempt = await DynamoFinanceRepository.forActor(member, 'link-payment');
    expect(reconcileProviderImport(attempt, candidate, actor.id).id).toBe(provisional.id);
    expect(
      linkUpcomingExpenseFulfillment(attempt, member, expense.id, fulfillmentInput, 'link-payment'),
    ).toEqual(originalFulfillment);
    const originalSnapshot = structuredClone(store);
    failCommit = true;
    await expect(attempt.commit()).rejects.toThrow('Simulated storage outage.');
    expect(store).toEqual(originalSnapshot);
    failCommit = false;
    await attempt.commit();

    const snapshot = JSON.parse(JSON.stringify([...store])) as [string, Record<string, unknown>][];
    store.clear();
    for (const [key, row] of snapshot) store.set(key, row);
    await expect(DynamoFinanceRepository.forActor(member, 'link-payment')).rejects.toMatchObject({
      code: 'finance_mutation_sources_changed',
    });
    const restored = await DynamoFinanceRepository.forActor(member);
    const writesBeforeRetry = transactions.length;
    expect(reconcileProviderImport(restored, candidate, actor.id).id).toBe(provisional.id);
    await restored.commit();
    expect(transactions).toHaveLength(writesBeforeRetry);
    expect([...restored.expenseFulfillments.values()]).toMatchObject([
      {
        id: fulfillmentInput.id,
        transactionId: provisional.id,
        amountMinor: 1000,
        calculationState: 'valid',
      },
    ]);
    expect([...restored.fulfillmentClaimVersions]).toEqual([[provisional.id, 1]]);
    expect(authorizedFinancialTaskLinksForTask(restored, member, task.id)).toMatchObject([
      { id: link.id, targetId: provisional.id, version: 2 },
    ]);
    expect(authorizedFinancialTaskLinksForTask(restored, member, duplicate.taskId)).toEqual([
      canonicalLink,
    ]);
    expect(restored.financialTaskLinks.get(duplicate.link.id)).toMatchObject({ status: 'removed' });
    expect(authorizedTasksForFinancialTarget(restored, member, target(provisional.id))).toEqual([
      task,
      duplicate.task,
    ]);
    expect(
      authorizedTasksForFinancialTarget(
        restored,
        { ...member, id: 'other-user' },
        target(provisional.id),
      ),
    ).toEqual([]);
    expect(store.has(keyOf(oldTargetKey))).toBe(false);
    expect(store.has(keyOf(oldPairKey))).toBe(false);
    expect(store.get(keyOf(newTargetKey))).toMatchObject({ data: { targetId: provisional.id } });
    expect(store.get(keyOf(reverseKey))).toMatchObject({ data: { targetId: provisional.id } });
    expect(store.get(keyOf(newPairKey))).toMatchObject({ linkId: link.id });

    // Restore the older task-link rows alongside the newer alias and fulfillment.
    const locatorKey = keyOf(financeKeys.financialTaskReverseLink(task.id, link.id));
    const sourceLocator = store.get(`FINANCE#LOCATOR#financialTaskLinks#${link.id}/CURRENT`)!;
    const sourceKey = keyOf(sourceLocator.storageKey as Record<string, unknown>);
    for (const key of [sourceKey, locatorKey, keyOf(oldTargetKey), keyOf(oldPairKey)])
      store.set(key, structuredClone(originalSnapshot.get(key)!));
    store.delete(keyOf(newTargetKey));
    store.delete(keyOf(newPairKey));
    const legacy = await DynamoFinanceRepository.forConnection('connection-a');
    await importSimplefinAccountsDurably(legacy, 'connection-a', accountInput.scope, {
      accounts: [],
    });
    const recovered = await DynamoFinanceRepository.forActor(member);
    expect(authorizedFinancialTaskLinksForTask(recovered, member, task.id)).toMatchObject([
      { id: link.id, targetId: provisional.id, version: 2 },
    ]);
    expect([...recovered.expenseFulfillments.values()]).toHaveLength(1);
    expect(store.has(keyOf(oldPairKey))).toBe(false);

    const restoredReceipt = attachmentSchema.parse(JSON.parse(JSON.stringify(receipt)));
    const restoredBlob = attachmentBlobSchema.parse(JSON.parse(JSON.stringify(blob)));
    const assertReceiptSource = async (parentId: string) => {
      expect(await resolveReceiptTransaction(parentId)).toMatchObject({
        id: provisional.id,
        accountId: accountInput.id,
        status: 'active',
        transferred: true,
      });
    };
    const read = createReceiptContentReader({
      findReceipt: async () => restoredReceipt,
      findBlob: async () => restoredBlob,
      authorize: async (parentId) => {
        await assertReceiptSource(parentId);
        return () => assertReceiptSource(parentId);
      },
      readBytes: async ({ versionId }) => {
        expect(versionId).toBe('verified-version');
        return bytes;
      },
    });
    const response = await read(receipt.id, {
      ifMatch: '"fixture-etag"',
      range: `bytes=0-${bytes.length - 1}`,
    });
    expect(response.statusCode).toBe(206);
    expect(createHash('sha256').update(Buffer.from(response.body, 'base64')).digest('hex')).toBe(
      receipt.checksumSha256,
    );
  });

  it('does not let another scope replace a live source locator with a colliding Finance link ID', async () => {
    vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
    const linkId = '01J00000000000000000000709';
    const firstGroup = '01J00000000000000000000701',
      secondGroup = '01J00000000000000000000702';
    const prepare = async (
      groupId: string,
      ownerId: string,
      budgetId: string,
      itemId: string,
      taskId: string,
    ) => {
      const member = {
        ...actor,
        id: ownerId,
        groupMemberships: [{ groupId, role: 'owner' as const }],
      };
      const repository = await DynamoFinanceRepository.forActor(member);
      repository.budgets.set(
        budgetId,
        createBudget({
          id: budgetId,
          groupId,
          name: 'Fixture budget',
          budgetDate: '2026-01-01',
          startDate: '2026-01-01',
        }),
      );
      repository.budgetItems.set(
        itemId,
        createBudgetItem({
          id: itemId,
          budgetId,
          description: 'Fixture bill',
          financeCategoryId: '01J00000000000000000000799',
          plannedAmountMinor: -1000,
          currency: 'USD',
          relatedAccountIds: [],
          creatorId: ownerId,
        }),
      );
      createTaskFromFinanceBudgetItem(
        repository,
        member,
        itemId,
        { taskId, linkId, label: 'Fixture payment', assigneeId: ownerId },
        'create-task',
      );
      return repository;
    };
    const first = await prepare(
      firstGroup,
      actor.id,
      '01J00000000000000000000711',
      '01J00000000000000000000712',
      '01J00000000000000000000713',
    );
    await first.commit();
    const key = `FINANCE#LOCATOR#financialTaskLinks#${linkId}/CURRENT`;
    const original = structuredClone(store.get(key));
    const second = await prepare(
      secondGroup,
      'another-owner',
      '01J00000000000000000000721',
      '01J00000000000000000000722',
      '01J00000000000000000000723',
    );
    await expect(second.commit()).rejects.toThrow(/conflict/i);
    expect(store.get(key)).toEqual(original);
    expect(store.has('TASK#01J00000000000000000000723/CURRENT')).toBe(false);
    expect(store.has(`FINANCE#SCOPE#GROUP#${secondGroup}/META`)).toBe(false);
    const originalActor = {
      ...actor,
      groupMemberships: [{ groupId: firstGroup, role: 'owner' as const }],
    };
    const deletion = await DynamoFinanceRepository.forActor(originalActor);
    deletion.financialTaskLinks.delete(linkId);
    const conflictingLocator = {
      ...original!,
      storageKey: {
        PK: `FINANCE#SCOPE#GROUP#${secondGroup}`,
        SK: (original!.storageKey as { SK: string }).SK,
      },
    };
    store.set(key, conflictingLocator);
    const canonical = structuredClone(
      store.get(keyOf(original!.storageKey as Record<string, unknown>)),
    );
    await expect(deletion.commit()).rejects.toThrow(/conflict/i);
    expect(store.get(key)).toEqual(conflictingLocator);
    expect(store.get(keyOf(original!.storageKey as Record<string, unknown>))).toEqual(canonical);
    const commits = transactions.length;
    await expect(
      DynamoFinanceRepository.backfillLocatorPage(`FINANCE#SCOPE#GROUP#${firstGroup}`),
    ).rejects.toThrow(/locator conflict/i);
    expect(transactions).toHaveLength(commits);
    expect(store.get(key)).toEqual(conflictingLocator);
  });
  it('creates the ordinary task and Finance link atomically in the shared table', async () => {
    const groupId = '01J00000000000000000000821';
    const budgetId = '01J00000000000000000000822';
    const itemId = '01J00000000000000000000823';
    const taskId = '01J00000000000000000000824';
    const member = { ...actor, groupMemberships: [{ groupId, role: 'member' as const }] };
    const repository = await DynamoFinanceRepository.forActor(member);
    repository.budgets.set(
      budgetId,
      createBudget({
        id: budgetId,
        groupId,
        name: 'Fixture plan',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
      }),
    );
    repository.budgetItems.set(
      itemId,
      createBudgetItem({
        id: itemId,
        budgetId,
        description: 'Fixture bill',
        financeCategoryId: '01J00000000000000000000826',
        plannedAmountMinor: -1000,
        currency: 'USD',
        relatedAccountIds: [],
        creatorId: actor.id,
      }),
    );
    await repository.commit();
    const creator = { ...member, id: 'other-creator' };
    const creation = await DynamoFinanceRepository.forActor(creator);
    createTaskFromFinanceBudgetItem(
      creation,
      creator,
      itemId,
      {
        taskId,
        linkId: '01J00000000000000000000825',
        label: 'Pay bill',
        assigneeId: actor.id,
      },
      'create-task',
    );
    failCommit = true;
    await expect(creation.commit()).rejects.toThrow('storage outage');
    expect(store.has(`TASK#${taskId}/CURRENT`)).toBe(false);
    expect(store.has('FINANCE#LOCATOR#financialTaskLinks#01J00000000000000000000825/CURRENT')).toBe(
      false,
    );
    expect((await DynamoFinanceRepository.forActor(member)).financialTaskLinks.size).toBe(0);
    failCommit = false;
    await creation.commit();
    expect(store.get(`TASK#${taskId}/CURRENT`)?.data).toMatchObject({
      id: taskId,
      label: 'Pay bill',
    });
    const fresh = await DynamoFinanceRepository.forActor(member);
    expect(fresh.tasks.has(taskId)).toBe(true);
    expect(fresh.financialTaskLinks.size).toBe(1);
    expect(
      store.get('FINANCE#LOCATOR#financialTaskLinks#01J00000000000000000000825/CURRENT'),
    ).toMatchObject({
      storageKey: { PK: `FINANCE#SCOPE#GROUP#${groupId}` },
    });
    expect(
      store.get(`FINANCE#TASK#${taskId}/TARGET_LINK#01J00000000000000000000825`),
    ).toMatchObject({ linkId: '01J00000000000000000000825', data: { targetId: itemId } });
    expect(
      store.get(
        `FINANCE#TASK_TARGET#budgetItem#${itemId}/TASK_LINK#01J00000000000000000000825`,
      ),
    ).toMatchObject({ linkId: '01J00000000000000000000825', data: { taskId } });
    expect(store.get(`FINANCE#TASK#${taskId}/TARGET_PAIR#budgetItem#${itemId}`)).toMatchObject({
      linkId: '01J00000000000000000000825',
    });
    accessState.memberships = [{ groupId, role: 'member', status: 'active' }];
    vi.stubEnv('CURSOR_SIGNING_SECRET', 'task-snapshot-fixture-secret-'.repeat(4));
    const linkSnapshotRequest = event('GET', `/api/v1/finance/tasks/${taskId}/link`);
    linkSnapshotRequest.headers['x-finance-cache-protocol'] = '1';
    const linkSnapshot = (await createFinanceHandler()(linkSnapshotRequest)) as {
      statusCode: number;
      body: string;
      headers: Record<string, string>;
    };
    expect(linkSnapshot.statusCode).toBe(200);
    expect(JSON.parse(linkSnapshot.body).link).toMatchObject({
      taskId,
      budgetId,
      budgetItemId: itemId,
    });
    expect(linkSnapshot.headers['x-finance-cache-proof']).toMatch(/^fc1\./u);
    let checks = 0;
    const read = await createFinanceHandler(undefined, async () => {
      if (++checks === 2) {
        const current = store.get(`TASK#${taskId}/CURRENT`)!;
        store.set(`TASK#${taskId}/CURRENT`, {
          ...current,
          data: { ...(current.data as object), visibility: 'private' },
        });
      }
      return { requirePin: false, securityRevision: 0, sessionEpoch: 0 };
    })(event('GET', `/api/v1/finance/tasks/${taskId}/link`));
    expect(read).toMatchObject({ statusCode: 409 });
    expect(JSON.stringify(bodyOf(read))).not.toContain(itemId);
    const renewedLink = (await syncHandler(
      event('POST', '/api/v1/sync/pull', {
        contractVersion: 8,
        financeCacheProtocol: 1,
        financeCacheOnly: true,
        financeCacheProof: linkSnapshot.headers['x-finance-cache-proof'],
      }),
      {} as never,
      () => undefined,
    )) as { statusCode: number; body: string };
    expect(renewedLink.statusCode).toBe(200);
    expect(JSON.parse(renewedLink.body).financeCache).toEqual({ status: 'refresh-required' });
    expect(renewedLink.body).not.toContain(itemId);
    expect(
      (await DynamoFinanceRepository.forActor(creator, 'create-task')).mutation(
        creator.id,
        'create-task',
      ),
    ).toBeDefined();
  });

  it('does not invoke the importer when saving the queued job fails', async () => {
    const repository = await DynamoFinanceRepository.forActor(actor);
    repository.connections.set('connection-1', {
      id: 'connection-1',
      scope: accountInput.scope,
      status: 'active',
      encryptedAccessUrl: 'AQID',
      version: 1,
    });
    const send = vi.fn(async () => ({}));
    await dispatchSimplefinRefresh(
      repository,
      'connection-1',
      'job-1',
      new Date('2026-01-01T00:00:00.000Z'),
      { send },
      'importer',
    );
    failCommit = true;
    await expect(repository.commit()).rejects.toThrow('storage outage');
    expect(send).not.toHaveBeenCalled();
  });

  it('creates and reads through greedy API Gateway routes using separate handler instances', async () => {
    const input = Object.fromEntries(Object.entries(accountInput).filter(([key]) => key !== 'id'));
    const created = await createFinanceHandler()(event('POST', '/api/v1/finance/accounts', input));
    expect(created).toMatchObject({ statusCode: 201 });
    const account = bodyOf(created);
    const read = await createFinanceHandler()(
      event('GET', `/api/v1/finance/accounts/${account.id}`),
    );
    expect(bodyOf(read)).toEqual(account);
    const balance = await createFinanceHandler()(
      event(
        'POST',
        `/api/v1/finance/accounts/${account.id}/balances`,
        {
          expectedAccountVersion: 1,
          balanceMinor: 15000,
          effectiveAt: '2026-01-02T00:00:00.000Z',
        },
        'balance-1',
      ),
    );
    expect(balance).toMatchObject({ statusCode: 201 });
    const replay = await createFinanceHandler()(event('POST', '/api/v1/finance/accounts', input));
    expect(bodyOf(replay)).toEqual(account);
    const list = bodyOf(await createFinanceHandler()(event('GET', '/api/v1/finance/accounts')));
    expect(list.items).toHaveLength(1);
    expect(list.items[0].currentBalanceMinor).toBe(15000);
  });

  it('rejects unknown paths and encoded path separators without dispatching a different record', async () => {
    for (const path of [
      '/api/v1/finance/unknown',
      '/api/v1/finance/accounts/a%2fb',
      '/api/v1/finance/accounts/%ZZ',
    ]) {
      expect(await createFinanceHandler()(event('GET', path))).toMatchObject({ statusCode: 404 });
    }
  });

  it('does not report a successful write or keep it in warm state when DynamoDB fails', async () => {
    failCommit = true;
    const input = Object.fromEntries(Object.entries(accountInput).filter(([key]) => key !== 'id'));
    expect(
      await createFinanceHandler()(event('POST', '/api/v1/finance/accounts', input)),
    ).toMatchObject({ statusCode: 500 });
    failCommit = false;
    expect(
      bodyOf(await createFinanceHandler()(event('GET', '/api/v1/finance/accounts'))).items,
    ).toEqual([]);
  });

  it('detects concurrent updates and prevents a stale writer from overwriting committed data', async () => {
    await createAccount();
    const first = await DynamoFinanceRepository.forActor(actor);
    const second = await DynamoFinanceRepository.forActor(actor);
    first.accounts.set(accountInput.id, {
      ...first.accounts.get(accountInput.id)!,
      friendlyName: 'First',
      version: 2,
    });
    second.accounts.set(accountInput.id, {
      ...second.accounts.get(accountInput.id)!,
      friendlyName: 'Second',
      version: 2,
    });
    await first.commit();
    await expect(second.commit()).rejects.toThrow('version conflict');
    expect(
      (await DynamoFinanceRepository.forActor(actor)).accounts.get(accountInput.id)?.friendlyName,
    ).toBe('First');
  });

  it('loads every query page without scanning and does not rewrite unchanged rows', async () => {
    await createAccount();
    pageSize = 1;
    const repository = await DynamoFinanceRepository.forActor(actor);
    expect(repository.accounts.size).toBe(1);
    expect(repository.balanceSnapshots).toHaveLength(1);
    const before = transactions.length;
    await repository.commit();
    expect(transactions).toHaveLength(before);
  });

  it('keeps private records out of unrelated users and administrators runtime state', async () => {
    await createAccount();
    for (const other of [
      { ...actor, id: 'other' },
      { ...actor, id: 'other-admin', role: 'admin' as const },
    ])
      expect((await DynamoFinanceRepository.forActor(other)).accounts.size).toBe(0);
  });

  it('persists 100-row CSV chunks in bounded atomic batches and replays them without duplicates', async () => {
    await createAccount();
    const input = {
      accountId: accountInput.id,
      batchId: '01J00000000000000000000002',
      fileDigest: 'a'.repeat(64),
      duplicateDecisionDigest: 'b'.repeat(64),
      duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
      chunkIndex: 0,
      finalChunk: true,
      rows: Array.from({ length: 100 }, (_, index) => ({
        ordinal: index + 1,
        amountMinor: -index - 1,
        transactedAt: '2026-01-02T00:00:00.000Z',
        description: `Fixture ${index}`,
      })),
    };
    // Two distinct rows from the approved file can have identical amount/date/description.
    input.rows[20] = { ...input.rows[0]!, ordinal: 21 };
    const repository = await DynamoFinanceRepository.forActor(actor);
    failCommitAt = transactions.length + 2;
    await expect(commitAuthorizedCsvImportChunk(repository, actor, input)).rejects.toThrow(
      /storage outage/i,
    );
    failCommitAt = -1;
    const interrupted = await DynamoFinanceRepository.forActor(actor);
    expect(interrupted.transactions).toHaveLength(20);
    const savedIds = interrupted.transactions.map((value) => value.id);
    expect(
      interrupted.transactions.every(
        (value) => financialTransactionSchema.safeParse(value).success,
      ),
    ).toBe(true);
    expect(await commitAuthorizedCsvImportChunk(interrupted, actor, input)).toMatchObject({
      status: 'succeeded',
      counts: { committed: 100 },
    });
    await interrupted.commit();
    const fresh = await DynamoFinanceRepository.forActor(actor);
    expect(fresh.transactions).toHaveLength(100);
    expect(new Set(fresh.transactions.map((value) => value.id)).size).toBe(100);
    expect(savedIds.every((id) => fresh.transactions.some((value) => value.id === id))).toBe(true);
    expect(
      fresh.transactions.every((value) => financialTransactionSchema.safeParse(value).success),
    ).toBe(true);
    expect(await commitAuthorizedCsvImportChunk(fresh, actor, input)).toMatchObject({
      counts: { committed: 100 },
    });
    await fresh.commit();
    await expect(
      commitAuthorizedCsvImportChunk(fresh, actor, {
        ...input,
        fileDigest: 'c'.repeat(64),
      }),
    ).rejects.toThrow('CSV import version conflict.');
    await expect(
      commitAuthorizedCsvImportChunk(fresh, actor, {
        ...input,
        rows: [{ ...input.rows[0]!, amountMinor: -999 }],
      }),
    ).rejects.toThrow('CSV import version conflict.');
    expect((await DynamoFinanceRepository.forActor(actor)).transactions).toHaveLength(100);
  });

  it('commits a refresh job before invoking a separate importer and preserves replay safety', async () => {
    const output = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const repository = await DynamoFinanceRepository.forActor(actor);
    await claimSimplefinConnection(
      repository,
      {
        id: 'connection-1',
        scope: accountInput.scope,
        setupToken: Buffer.from('https://bridge.simplefin.org/claim').toString('base64'),
        allowedHosts: ['bridge.simplefin.org'],
        keyId: 'key-1',
      },
      {
        kms: { send: async () => ({ CiphertextBlob: new Uint8Array([1, 2, 3]) }) },
        fetcher: (async () =>
          new Response('https://user:pass@bridge.simplefin.org/simplefin')) as typeof fetch,
      },
    );
    let invoked = false;
    await dispatchSimplefinRefresh(
      repository,
      'connection-1',
      'job-1',
      new Date('2026-01-01T00:00:00.000Z'),
      {
        send: async () => {
          invoked = true;
          const importer = await DynamoFinanceRepository.forConnection('connection-1');
          expect(importer.importJobs.get('job-1')?.status).toBe('queued');
          await executeFinanceImport(
            { connectionId: 'connection-1', jobId: 'job-1' },
            {
              repository: importer,
              allowedHosts: ['bridge.simplefin.org'],
              kms: {
                send: async () => ({
                  Plaintext: new TextEncoder().encode(
                    'https://user:pass@bridge.simplefin.org/simplefin',
                  ),
                }),
              },
              fetcher: (async () =>
                new Response(JSON.stringify(simplefinV2Fixture))) as typeof fetch,
              now: () => new Date('2026-01-01T00:00:01.000Z'),
            },
          );
          return {};
        },
      },
      'finance-import',
    );
    expect(invoked).toBe(false);
    await repository.commit();
    expect(invoked).toBe(true);
    const fresh = await DynamoFinanceRepository.forActor(actor);
    expect(fresh.accounts.size).toBeGreaterThan(0);
    expect(fresh.transactions.length).toBeGreaterThan(0);
    expect(fresh.importJobs.get('job-1')?.status).toBe('succeeded');
    const logs = output.mock.calls.map(
      ([line]) => JSON.parse(String(line)) as Record<string, unknown>,
    );
    expect(logs.some((line) => line.operation === 'finance.import.completed')).toBe(true);
    expect(JSON.stringify(logs)).not.toContain('FinanceImportCompletions');
    // The exported production handler must also load durable state before replaying a completed job.
    await expect(
      importHandler({ connectionId: 'connection-1', jobId: 'job-1' }, {} as never, () => {}),
    ).resolves.toMatchObject({ status: 'succeeded' });
    const groupId = '01J00000000000000000000821';
    const reassignment = await DynamoFinanceRepository.forActor({
      ...actor,
      groupMemberships: [{ groupId, role: 'owner' }],
    });
    const account = [...reassignment.accounts.values()][0]!;
    reassignment.accounts.set(account.id, {
      ...account,
      scope: { type: 'group', groupId },
      version: account.version + 1,
    });
    await reassignment.commit();
    expect(store.get(keyOf({ PK: `FINANCE#SCOPE#OWNER#${actor.id}`, SK: 'META' }))).toMatchObject({
      financeAuthorizationRevision: 1,
    });
    expect(store.get(keyOf({ PK: `FINANCE#SCOPE#GROUP#${groupId}`, SK: 'META' }))).toMatchObject({
      financeAuthorizationRevision: 1,
    });
    const relocated = await DynamoFinanceRepository.forConnection('connection-1');
    expect(relocated.accounts.get(account.id)?.scope).toEqual({ type: 'group', groupId });
    expect(relocated.transactions).toHaveLength(fresh.transactions.length);
    const removed = relocated.transactions.shift()!;
    await relocated.commit();
    const witnessKey = { PK: `FINANCE#PUBLICATION_DELETION#${removed.id}`, SK: 'CURRENT' };
    const firstProof = store.get(keyOf(witnessKey))!;
    expect(store.get(keyOf({ PK: `FINANCE#SCOPE#GROUP#${groupId}`, SK: 'META' }))).toMatchObject({
      financeAuthorizationRevision: 2,
    });
    expect(firstProof).toMatchObject({
      transactionId: removed.id,
      accountIds: [account.id],
      beforeVersion: removed.version,
    });
    expect(JSON.stringify(firstProof)).not.toContain(removed.description);
    relocated.transactions.push({ ...removed, version: removed.version + 1 });
    await relocated.commit();
    relocated.transactions.splice(
      relocated.transactions.findIndex((row) => row.id === removed.id),
      1,
    );
    await relocated.commit();
    expect(store.get(keyOf(witnessKey))).toMatchObject({ beforeVersion: removed.version + 1 });
    expect(store.get(keyOf(witnessKey))?.publicationId).not.toBe(firstProof.publicationId);
    expect(store.get(keyOf({ PK: `FINANCE#SCOPE#GROUP#${groupId}`, SK: 'META' }))).toMatchObject({
      financeAuthorizationRevision: 3,
    });
    expect(JSON.stringify([...store.values()])).not.toContain('user:pass');
  });
});

async function reusableReplayFixture() {
  vi.stubEnv('CURSOR_SIGNING_SECRET', 'reusable-proof-fixture-secret-'.repeat(4));
  vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
  const groupId = '01J00000000000000000000951',
    id = '01J00000000000000000000952',
    categoryId = '01J00000000000000000000953',
    mutationId = '01J00000000000000000000954';
  accessState.memberships = [{ groupId, role: 'owner', status: 'active' }];
  const owner = { ...actor, groupMemberships: [{ groupId, role: 'owner' as const }] };
  const repository = await DynamoFinanceRepository.forActor(owner);
  repository.categories.set(
    categoryId,
    createUserFinanceCategory({
      id: categoryId,
      name: 'Reusable fixture category',
      creatorId: actor.id,
    }),
  );
  await createManualAccount(
    repository,
    owner,
    { ...accountInput, scope: { type: 'group', groupId } },
    'seed-reusable-account',
  );
  await repository.commit();
  const countKey = (entryKey: string) => ({
    PK: 'FINANCE#CATALOG',
    SK: `ROW#catalogReferenceCounts#${createHash('sha256').update(entryKey).digest('hex')}`,
  });
  for (const [entryKey, data] of [
    [`category:${categoryId}`, 17],
    ['category:unrelated', 23],
  ] as const) {
    const key = countKey(entryKey);
    store.set(keyOf(key), { ...key, collection: 'catalogReferenceCounts', entryKey, data });
  }
  const mutation = {
    id: mutationId,
    entityId: id,
    entityType: 'financeReusableItem',
    operation: 'create',
    baseVersion: 0,
    payload: {
      id,
      groupId,
      description: 'Queued synthetic reusable bill',
      financeCategoryId: categoryId,
      plannedAmountMinor: -1000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [accountInput.id],
      applicableDate: '2026-12-01',
      creatorId: 'pending',
      status: 'active',
      version: 1,
    },
    createdAt: '2026-11-09T00:00:00Z',
    attempts: 0,
  };
  const replay = (value = mutation) =>
    syncHandler(
      event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [value] }),
      {} as never,
      () => undefined,
    ) as Promise<{ statusCode: number; body: string }>;
  const result = async (value = mutation) => JSON.parse((await replay(value)).body).results[0];
  return { groupId, id, categoryId, mutation, result, countKey };
}
it('replays queued reusable creation exactly once with bounded source reads and preserved catalogue counters', async () => {
  const f = await reusableReplayFixture();
  const unrelated = structuredClone(store.get(keyOf(f.countKey('category:unrelated'))));
  vi.mocked(dynamodb.send).mockClear();
  expect(await f.result()).toMatchObject({ status: 'applied', version: 1 });
  const writes = transactions.length;
  expect(await f.result()).toMatchObject({ status: 'alreadyApplied', version: 1 });
  expect(
    await f.result({
      ...f.mutation,
      payload: { ...f.mutation.payload, description: 'Changed intent' },
    }),
  ).toMatchObject({ status: 'conflict' });
  expect(transactions).toHaveLength(writes);
  expect(store.get(keyOf(f.countKey(`category:${f.categoryId}`)))?.data).toBe(18);
  expect(store.get(keyOf(f.countKey('category:unrelated')))).toEqual(unrelated);
  const rows = [...store.values()].filter((row) => row.collection === 'reusableItems');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.data).toMatchObject({ id: f.id, creatorId: actor.id, version: 1 });
  expect(vi.mocked(dynamodb.send).mock.calls.some(([c]) => c instanceof QueryCommand)).toBe(false);
  const direct = event('POST', `/api/v1/finance/reusable-items/${f.id}`, f.mutation.payload);
  expect(((await createFinanceHandler()(direct)) as { statusCode: number }).statusCode).toBe(400);
  // Verify the real handler/source-guard feed path after the bounded creation replay.
  vi.mocked(dynamodb.send).mockClear();
  const pulled = (await syncHandler(
    event('POST', '/api/v1/sync/pull', {
      contractVersion: 8,
      financeCacheProtocol: 1,
      financeCursor: {},
      cursor: {},
    }),
    {} as never,
    () => undefined,
  )) as { statusCode: number; body: string };
  expect(pulled.statusCode).toBe(200);
  const delivery = JSON.parse(pulled.body);
  expect(delivery.financeState).toBe('ready');
  expect(delivery.financeCache).toMatchObject({ status: 'current' });
  expect(delivery.financeChanges).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        entityType: 'financeReusableItem',
        entityId: f.id,
        payload: expect.objectContaining({ id: f.id, creatorId: actor.id, version: 1 }),
      }),
    ]),
  );
  for (const [command] of vi.mocked(dynamodb.send).mock.calls)
    if (command instanceof QueryCommand)
      expect(String(command.input.ExpressionAttributeValues?.[':pk'])).toMatch(/^FEED#/);
  accessState.canonicalMemberships = [];
  vi.mocked(dynamodb.send).mockClear();
  expect(await f.result()).toMatchObject({ status: 'conflict' });
  expect(transactions).toHaveLength(writes);
  expect(
    vi
      .mocked(dynamodb.send)
      .mock.calls.some(
        ([c]) => c instanceof GetCommand && c.input.Key?.PK === `FINANCE#SCOPE#GROUP#${f.groupId}`,
      ),
  ).toBe(false);
});
it('preserves queued reusable intent through storage failure and denies foreign or unverified source pointers without history fallback', async () => {
  const f = await reusableReplayFixture();
  const locatorKey = `FINANCE#LOCATOR#accounts#${accountInput.id}/CURRENT`;
  const locator = structuredClone(store.get(locatorKey)!);
  const foreign = 'FINANCE#SCOPE#GROUP#01J00000000000000000000999';
  store.set(locatorKey, {
    ...locator,
    storageKey: { ...(locator.storageKey as object), PK: foreign },
  });
  vi.mocked(dynamodb.send).mockClear();
  expect(await f.result()).toMatchObject({ status: 'conflict' });
  expect(
    vi
      .mocked(dynamodb.send)
      .mock.calls.some(([c]) => c instanceof GetCommand && c.input.Key?.PK === foreign),
  ).toBe(false);
  store.delete(locatorKey);
  expect(await f.result()).toMatchObject({ status: 'retry' });
  store.set(locatorKey, locator);
  const before = structuredClone([...store]);
  failCommit = true;
  expect(await f.result()).toMatchObject({ status: 'retry' });
  expect([...store]).toEqual(before);
  failCommit = false;
  expect(await f.result()).toMatchObject({ status: 'applied', version: 1 });
  expect(await f.result()).toMatchObject({ status: 'alreadyApplied', version: 1 });
  expect(vi.mocked(dynamodb.send).mock.calls.some(([c]) => c instanceof QueryCommand)).toBe(false);
});

async function manualTransactionReplayFixture() {
  vi.stubEnv('CURSOR_SIGNING_SECRET', 'manual-transaction-proof-fixture-'.repeat(4));
  vi.stubEnv('NAASEH_FINANCE_PUBLICATION_EVENT_BUS', '');
  const id = '01J00000000000000000000961';
  const mutationId = '01J00000000000000000000962';
  const categoryId = '01J00000000000000000000963';
  const merchantId = '01J00000000000000000000964';
  const allocationId = '01J00000000000000000000965';
  const repository = await DynamoFinanceRepository.forActor(actor);
  repository.categories.set(
    categoryId,
    createUserFinanceCategory({ id: categoryId, name: 'Queued dining', creatorId: actor.id }),
  );
  repository.merchants.set(
    merchantId,
    createMerchant({
      id: merchantId,
      name: 'Fixture Cafe',
      source: 'manual',
      creatorId: actor.id,
    }),
  );
  await createManualAccount(repository, actor, accountInput, 'seed-manual-transaction-account');
  await repository.commit();
  const mutation = {
    id: mutationId,
    entityId: id,
    entityType: 'financeTransaction',
    operation: 'create',
    baseVersion: 0,
    payload: {
      id,
      accountId: accountInput.id,
      expectedAccountVersion: 1,
      amountMinor: -1250,
      transactedAt: '2026-11-09T12:00:00.000Z',
      description: 'Queued fixture purchase',
      payee: 'Fixture Cafe',
      merchantId,
      paymentType: 'card',
      allocations: [{ id: allocationId, amountMinor: -1250, financeCategoryId: categoryId }],
    },
    createdAt: '2026-11-09T12:01:00.000Z',
    attempts: 0,
  };
  const replay = (value: typeof mutation = mutation) =>
    syncHandler(
      event('POST', '/api/v1/sync/push', { contractVersion: 8, mutations: [value] }),
      {} as never,
      () => undefined,
    ) as Promise<{ statusCode: number; body: string }>;
  const result = async (value: typeof mutation = mutation) =>
    JSON.parse((await replay(value)).body).results[0];
  return { id, categoryId, merchantId, allocationId, mutation, result };
}

it('replays queued manual transaction creation exactly once with bounded point reads and conditional writes', async () => {
  const fixture = await manualTransactionReplayFixture();
  vi.mocked(dynamodb.send).mockClear();
  expect(await fixture.result()).toMatchObject({ status: 'applied', version: 1 });
  const writes = transactions.length;
  expect(await fixture.result()).toMatchObject({ status: 'alreadyApplied', version: 1 });
  expect(
    await fixture.result({
      ...fixture.mutation,
      payload: { ...fixture.mutation.payload, amountMinor: -2500 },
    }),
  ).toMatchObject({ status: 'conflict' });
  expect(transactions).toHaveLength(writes);
  const rows = [...store.values()].filter((row) => row.collection === 'transactions');
  expect(rows).toHaveLength(1);
  expect(rows[0]!.data).toMatchObject({
    id: fixture.id,
    accountId: accountInput.id,
    amountMinor: -1250,
    origin: 'manual',
    merchantId: fixture.merchantId,
    allocations: [
      expect.objectContaining({
        id: fixture.allocationId,
        financeCategoryId: fixture.categoryId,
        classification: expect.objectContaining({ categoryLabel: 'Queued dining' }),
      }),
    ],
    version: 1,
  });
  const account = [...store.values()].find(
    (row) => row.collection === 'accounts' && row.entryKey === accountInput.id,
  );
  expect(account?.data).toMatchObject({ currentBalanceMinor: 8750, version: 2 });
  expect(vi.mocked(dynamodb.send).mock.calls.some(([c]) => c instanceof QueryCommand)).toBe(false);
  const transactionWrites = transactions.flatMap((command) => command.input.TransactItems ?? []);
  expect(
    transactionWrites.some(
      (write) =>
        write.Put?.Item?.PK === `FINANCE#LOCATOR#transactions#${fixture.id}` &&
        write.Put.ConditionExpression === 'attribute_not_exists(PK)',
    ),
  ).toBe(true);
  expect(
    transactionWrites.some(
      (write) =>
        write.Put?.Item?.PK === `FINANCE#SCOPE#OWNER#${actor.id}` &&
        write.Put?.Item?.SK === 'META' &&
        write.Put.ConditionExpression === '#revision = :expected',
    ),
  ).toBe(true);
});

it('denies foreign or missing manual transaction source pointers without hydrating account history', async () => {
  const fixture = await manualTransactionReplayFixture();
  const locatorKey = `FINANCE#LOCATOR#accounts#${accountInput.id}/CURRENT`;
  const locator = structuredClone(store.get(locatorKey)!);
  const foreign = 'FINANCE#SCOPE#OWNER#foreign-owner';
  store.set(locatorKey, {
    ...locator,
    storageKey: { ...(locator.storageKey as object), PK: foreign },
  });
  vi.mocked(dynamodb.send).mockClear();
  expect(await fixture.result()).toMatchObject({ status: 'conflict' });
  expect(
    vi
      .mocked(dynamodb.send)
      .mock.calls.some(
        ([command]) => command instanceof GetCommand && command.input.Key?.PK === foreign,
      ),
  ).toBe(false);
  store.delete(locatorKey);
  expect(await fixture.result()).toMatchObject({ status: 'conflict' });
  expect(vi.mocked(dynamodb.send).mock.calls.some(([c]) => c instanceof QueryCommand)).toBe(false);
});

it('does not certify or repair unverified legacy scope state when metadata is missing', async () => {
  const f = await reusableReplayFixture();
  const PK = `FINANCE#SCOPE#GROUP#${f.groupId}`;
  store.delete(`${PK}/META`);
  const value = { ...f.mutation, payload: { ...f.mutation.payload, relatedAccountIds: [] } };
  const original = structuredClone([...store]);
  vi.mocked(dynamodb.send).mockClear();
  expect(await f.result(value)).toMatchObject({ status: 'retry' });
  expect([...store]).toEqual(original);
  const firstQueries = vi
    .mocked(dynamodb.send)
    .mock.calls.map(([command]) => command)
    .filter((command) => command instanceof QueryCommand);
  expect(firstQueries).toHaveLength(1);
  expect(firstQueries[0]!.input).toMatchObject({
    KeyConditionExpression: 'PK = :pk',
    Limit: 1,
    ProjectionExpression: 'PK, SK',
    ConsistentRead: true,
  });
  // Even without canonical rows, surviving publication state forbids a new revision-one scope.
  for (const [key, row] of store)
    if (row.PK === PK && String(row.SK).startsWith('ROW#')) store.delete(key);
  const journalsOnly = structuredClone([...store]);
  expect(await f.result(value)).toMatchObject({ status: 'retry' });
  expect([...store]).toEqual(journalsOnly);
  const groupId = '01J00000000000000000000956',
    id = '01J00000000000000000000957';
  accessState.memberships.push({ groupId, role: 'owner', status: 'active' });
  expect(
    await f.result({
      ...f.mutation,
      id: '01J00000000000000000000958',
      entityId: id,
      payload: { ...f.mutation.payload, id, groupId, relatedAccountIds: [] },
    }),
  ).toMatchObject({ status: 'applied' });
  expect(store.get(`FINANCE#SCOPE#GROUP#${groupId}/META`)?.refundRelationshipIndexVersion).toBe(1);
});

it('rejects client-selected reusable IDs already claimed by another Finance entity type without changing canonical state', async () => {
  const f = await reusableReplayFixture();
  const before = structuredClone([...store]);
  vi.mocked(dynamodb.send).mockClear();
  const value = {
    ...f.mutation,
    entityId: accountInput.id,
    payload: { ...f.mutation.payload, id: accountInput.id },
  };
  expect(await f.result(value)).toMatchObject({ status: 'conflict' });
  expect([...store]).toEqual(before);
  expect(
    vi.mocked(dynamodb.send).mock.calls.some(([command]) => command instanceof QueryCommand),
  ).toBe(false);
});

describe('Finance dashboard preference endpoints', () => {
  const path = '/api/v1/finance/dashboard-preferences';

  it('uses protected point reads and atomically saves and replays an owner flag and count', async () => {
    const repository = await DynamoFinanceRepository.forActor(actor);
    createManualAccount(repository, actor, accountInput, 'dashboard-account');
    await repository.commit();
    const handler = createFinanceHandler();
    expect(bodyOf(await handler(event('GET', path)))).toEqual({
      flags: [],
      settings: { upcomingCount: 10, version: 0 },
    });
    const url = `${path}/account/${accountInput.id}`;
    const write = event('PUT', url, { included: true }, 'dashboard-flag');
    const first = await handler(write);
    expect(first).toMatchObject({ statusCode: 200 });
    expect(bodyOf(first)).toEqual({
      targetKind: 'account',
      targetId: accountInput.id,
      included: true,
      version: 1,
    });
    expect(transactions.at(-1)?.input.TransactItems?.[0]).toMatchObject({
      ConditionCheck: { Key: { PK: 'FINANCE#SCOPE#OWNER#owner-1', SK: 'META' } },
    });
    const writes = transactions.length;
    expect(bodyOf(await handler(write))).toEqual(bodyOf(first));
    expect(transactions).toHaveLength(writes);
    expect(await handler(event('PUT', url, { included: false }, 'dashboard-flag'))).toMatchObject({
      statusCode: 409,
    });
    expect(
      await handler(
        event('PATCH', path, { upcomingCount: 20, expectedVersion: 0 }, 'dashboard-count'),
      ),
    ).toMatchObject({ statusCode: 200 });
    expect(bodyOf(await handler(event('GET', path)))).toEqual({
      flags: [bodyOf(first)],
      settings: { upcomingCount: 20, version: 1 },
    });
  });

  it('uses current group membership for reads, writes and exact write retries', async () => {
    const groupId = '01J00000000000000000000291';
    const budgetId = '01J00000000000000000000292';
    const member = {
      groupId,
      userId: actor.id,
      role: 'member' as const,
      status: 'active' as const,
    };
    accessState.memberships = [member];
    const memberKey = { PK: `GROUP#${groupId}`, SK: `MEMBER#${actor.id}` };
    store.set(keyOf(memberKey), { ...memberKey, data: member });
    const grouped = { ...actor, groupMemberships: [{ groupId, role: 'member' as const }] };
    const repo = await DynamoFinanceRepository.forActor(grouped);
    await createFinanceBudget(
      repo,
      grouped,
      {
        id: budgetId,
        groupId,
        name: 'Dashboard budget',
        budgetDate: '2026-01-01',
        startDate: '2026-01-01',
        status: 'active',
      },
      'dashboard-budget',
    );
    await repo.commit();
    const handler = createFinanceHandler();
    const request = event(
      'PUT',
      `${path}/budget/${budgetId}`,
      { included: true },
      'dashboard-budget-flag',
    );
    expect(await handler(request)).toMatchObject({ statusCode: 200 });
    expect(transactions.at(-1)?.input.TransactItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ConditionCheck: expect.objectContaining({ Key: memberKey }) }),
      ]),
    );
    store.delete(keyOf(memberKey));
    accessState.memberships = [];
    expect(bodyOf(await handler(event('GET', path))).flags).toEqual([]);
    expect(await handler(request)).toMatchObject({ statusCode: 404 });
  });
});
