import { beforeEach, describe, expect, it, vi } from 'vitest';
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
} from '../../apps/api/src/finance/connection-service.js';
import {
  executeFinanceImport,
  handler as importHandler,
} from '../../apps/api/src/finance/import-handler.js';
import { createBudget, createBudgetItem, createUserFinanceCategory } from '@naaseh/domain';
import {
  createFinanceBudget,
  linkFinanceBudgetAccount,
  getFinanceBudget,
} from '../../apps/api/src/finance/budget-service.js';
import { createTaskFromFinanceBudgetItem } from '../../apps/api/src/finance/task-link-service.js';
import { simplefinV2Fixture } from '../fixtures/finance/simplefin.js';

vi.mock('../../apps/api/src/groups/group-repository.js', () => ({
  listUserMemberships: async () => [],
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
          (row) => row.PK === values[':pk'] && String(row.SK).startsWith(String(values[':row'])),
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
    if (failCommit) throw new Error('Simulated storage outage.');
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
      else if (condition === '#revision = :expected')
        passes = current?.revision === operation.ExpressionAttributeValues?.[':expected'];
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

describe('Finance deployed storage and routing', () => {
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
    const preview = bodyOf(
      await createFinanceHandler()(
        event('GET', `/api/v1/finance/records/category/${categoryId}/deletion-preview`),
      ),
    );
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
    const revoked = await DynamoFinanceRepository.forActor(actor, 'budget-create');
    expect(revoked.budgets.size).toBe(0);
    expect(revoked.mutation(actor.id, 'budget-create')).toBeUndefined();
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
    await repository.commit();
    const other = { ...member, id: 'other-member' };
    const fresh = await DynamoFinanceRepository.forActor(other);
    const view = getFinanceBudget(fresh, other, budget.id);
    expect(view.totalsComplete).toBe(false);
    expect(view.accountLinks).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(accountInput.id);
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
    createTaskFromFinanceBudgetItem(
      repository,
      member,
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
    await expect(repository.commit()).rejects.toThrow('storage outage');
    expect(store.has(`TASK#${taskId}/CURRENT`)).toBe(false);
    expect((await DynamoFinanceRepository.forActor(member)).financialTaskLinks.size).toBe(0);
    failCommit = false;
    await repository.commit();
    expect(store.get(`TASK#${taskId}/CURRENT`)?.data).toMatchObject({
      id: taskId,
      label: 'Pay bill',
    });
    const fresh = await DynamoFinanceRepository.forActor(member);
    expect(fresh.tasks.has(taskId)).toBe(true);
    expect(fresh.financialTaskLinks.size).toBe(1);
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

  it('keeps private records out of other users and administrator runtime state', async () => {
    await createAccount();
    for (const other of [
      { ...actor, id: 'other' },
      { ...actor, role: 'admin' as const },
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
    const repository = await DynamoFinanceRepository.forActor(actor);
    expect(await commitAuthorizedCsvImportChunk(repository, actor, input)).toMatchObject({
      status: 'succeeded',
      counts: { committed: 100 },
    });
    await repository.commit();
    const fresh = await DynamoFinanceRepository.forActor(actor);
    expect(fresh.transactions).toHaveLength(100);
    expect(await commitAuthorizedCsvImportChunk(fresh, actor, input)).toMatchObject({
      counts: { committed: 100 },
    });
    await fresh.commit();
    expect((await DynamoFinanceRepository.forActor(actor)).transactions).toHaveLength(100);
  });

  it('commits a refresh job before invoking a separate importer and preserves replay safety', async () => {
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
    const relocated = await DynamoFinanceRepository.forConnection('connection-1');
    expect(relocated.accounts.get(account.id)?.scope).toEqual({ type: 'group', groupId });
    expect(relocated.transactions).toHaveLength(fresh.transactions.length);
    expect(JSON.stringify([...store.values()])).not.toContain('user:pass');
  });
});
