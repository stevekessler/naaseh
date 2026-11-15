import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  createBudget,
  createFinancialAccount,
  createFinancialTransaction,
  createTask,
  createUpcomingExpense,
  transitionTask,
} from '@naaseh/domain';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import {
  FinanceRouteRegistry,
  registerUserStory1FinanceRoutes,
} from '../../apps/api/src/finance/handlers.js';
import {
  authorizedFinancialTaskLinksForTask,
  authorizedFinancialTaskLinksForTasks,
  authorizedTasksForFinancialTarget,
  createAuthorizedFinancialTaskLink,
  createTaskWithFinanceLinks,
  removeAuthorizedFinancialTaskLink,
} from '../../apps/api/src/finance/task-link-service.js';
import { dispatchFinanceReplay } from '../../apps/api/src/finance/sync-replay.js';

const id = (ordinal: number) => `01J${String(ordinal).padStart(23, '0')}`;
const actor = {
  id: 'owner', role: 'user' as const, active: true,
  groupMemberships: [{ groupId: id(1), role: 'member' as const }],
};

function fixture() {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(id(2), createFinancialAccount({
    id: id(2), scope: { type: 'owner', ownerId: actor.id }, sourceName: 'Cash',
    organizationName: 'Manual', accountType: 'checking', currency: 'USD',
    openingBalanceMinor: 50_000, balanceAt: '2028-01-01T00:00:00.000Z',
  }));
  repository.budgets.set(id(3), createBudget({
    id: id(3), groupId: id(1), name: 'Plan', budgetDate: '2028-01-01',
    startDate: '2028-01-01', status: 'active',
  }));
  repository.transactions.push(createFinancialTransaction({
    id: id(4), accountId: id(2), origin: 'manual', amountMinor: -1200, currency: 'USD',
    transactedAt: '2028-01-02T00:00:00.000Z', description: 'Private purchase', pending: false,
    connectedAccount: false,
  }));
  repository.upcomingExpenses.set(id(5), createUpcomingExpense({
    id: id(5), groupId: id(1), accountId: id(2), budgetId: id(3), description: 'Future bill',
    expectedAmountMinor: 3000, currency: 'USD', dueDate: '2028-02-01', creatorId: actor.id,
    acceptedAt: '2028-01-01T00:00:00.000Z',
    entryContext: { localDate: '2028-01-01', timeZone: 'America/Denver',
      enteredAt: '2028-01-01T07:00:00.000Z' },
  }));
  const task = { ...createTask({ label: 'Review expenses', visibility: 'public' }, actor.id,
    new Date('2028-01-01T00:00:00.000Z')), id: id(6) };
  repository.tasks.set(task.id, task);
  return { repository, task };
}

const event = (
  method: string,
  rawPath: string,
  body: unknown,
  pathParameters: Record<string, string>,
  mutationId = 'phase-11-route',
) => ({
  version: '2.0', routeKey: `${method} ${rawPath}`, rawPath, rawQueryString: '',
  headers: { 'idempotency-key': mutationId },
  requestContext: { requestId: mutationId, routeKey: '', stage: '$default', time: '', timeEpoch: 0,
    http: { method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: '127.0.0.1', userAgent: 'vitest' } },
  body: JSON.stringify(body), pathParameters, isBase64Encoded: false,
}) as APIGatewayProxyEventV2;

describe('multi-target Finance task links', () => {
  it('replays an offline relationship with its stable link identity after task creation', async () => {
    let forwarded: APIGatewayProxyEventV2 | undefined;
    const mutation = {
      id: id(70),
      entityId: id(71),
      entityType: 'financeTaskLink' as const,
      operation: 'create' as const,
      baseVersion: 0,
      createdAt: '2028-01-01T00:00:00.000Z',
      payload: {
        taskId: id(6),
        linkId: id(71),
        targetType: 'upcomingExpense',
        targetId: id(5),
        expectedTaskVersion: 1,
      },
    };
    const result = await dispatchFinanceReplay(
      event('POST', '/api/v1/sync/push', {}, {}, 'phase-11-offline-link'),
      mutation,
      async (request) => {
        forwarded = request;
        return {
          statusCode: 201,
          body: JSON.stringify({ link: { id: id(71), version: 1 } }),
        };
      },
    );
    expect(result).toMatchObject({ mutationId: id(70), status: 'applied', version: 1 });
    expect(forwarded).toMatchObject({
      rawPath: `/api/v1/finance/tasks/${id(6)}/finance-links`,
      headers: { 'x-finance-sync-replay': 'task-link-create-v1' },
    });
    expect(JSON.parse(forwarded!.body!)).toEqual({
      targetType: 'upcomingExpense',
      targetId: id(5),
      expectedTaskVersion: 1,
      linkId: id(71),
    });
  });

  it('links several targets, reads both directions in a bounded batch, and unlinks one only', () => {
    const { repository, task } = fixture();
    const transactionLink = createAuthorizedFinancialTaskLink(
      repository, actor, task.id, { targetType: 'transaction', targetId: id(4) }, id(7), 1,
    );
    createAuthorizedFinancialTaskLink(
      repository, actor, task.id, { targetType: 'upcomingExpense', targetId: id(5) }, id(8), 1,
    );
    expect(authorizedFinancialTaskLinksForTask(repository, actor, task.id)).toHaveLength(2);
    expect(authorizedFinancialTaskLinksForTasks(repository, actor, [task.id]).get(task.id)).toHaveLength(2);
    expect(authorizedTasksForFinancialTarget(repository, actor, {
      targetType: 'upcomingExpense', targetId: id(5),
    })).toEqual([task]);
    removeAuthorizedFinancialTaskLink(repository, actor, transactionLink.id, 1);
    expect(authorizedFinancialTaskLinksForTask(repository, actor, task.id)).toMatchObject([
      { targetType: 'upcomingExpense', targetId: id(5) },
    ]);
    expect(repository.transactions[0]).toMatchObject({ amountMinor: -1200, status: 'active' });
  });

  it('completing the task has no financial or upcoming-expense side effect', () => {
    const { repository, task } = fixture();
    createAuthorizedFinancialTaskLink(
      repository, actor, task.id, { targetType: 'upcomingExpense', targetId: id(5) }, id(8), 1,
    );
    const expenseBefore = structuredClone(repository.upcomingExpenses.get(id(5)));
    repository.tasks.set(task.id, transitionTask(task, 'completed', actor.id));
    expect(repository.upcomingExpenses.get(id(5))).toEqual(expenseBefore);
    expect(repository.expenseFulfillments.size).toBe(0);
    repository.tasks.delete(task.id);
    expect(repository.upcomingExpenses.get(id(5))).toEqual(expenseBefore);
    expect(repository.expenseFulfillments.size).toBe(0);
  });

  it('rejects duplicate pairs and batches over fifty task ids', () => {
    const { repository, task } = fixture();
    createAuthorizedFinancialTaskLink(
      repository, actor, task.id, { targetType: 'transaction', targetId: id(4) }, id(7), 1,
    );
    expect(() => createAuthorizedFinancialTaskLink(
      repository, actor, task.id, { targetType: 'transaction', targetId: id(4) }, id(9), 1,
    )).toThrow('already linked');
    expect(() => authorizedFinancialTaskLinksForTasks(
      repository, actor, Array.from({ length: 51 }, (_, index) => id(100 + index)),
    )).toThrow('1 to 50');
  });

  it('exposes transaction creation, task link CRUD/query, and reverse navigation routes', async () => {
    const { repository, task } = fixture();
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository, actorFor: () => actor, now: () => new Date('2028-01-01T00:00:00.000Z'),
    });
    const transactionPath = '/api/v1/finance/transactions/{transactionId}/tasks';
    const created = await registry.resolve('POST', transactionPath)!(event(
      'POST', transactionPath, { label: 'Review transaction', assigneeId: actor.id },
      { transactionId: id(4) },
    ));
    expect(created.statusCode).toBe(201);
    const createdBody = JSON.parse(String(created.body));
    expect(createdBody).toEqual({ taskId: expect.any(String), financialTaskLinkId: expect.any(String) });

    const linkPath = '/api/v1/finance/tasks/{taskId}/finance-links';
    const attached = await registry.resolve('POST', linkPath)!(event(
      'POST', linkPath,
      { targetType: 'upcomingExpense', targetId: id(5), expectedTaskVersion: 1 },
      { taskId: task.id }, 'phase-11-attach',
    ));
    expect(attached.statusCode).toBe(201);
    const attachedLink = JSON.parse(String(attached.body)).link;

    const queried = await registry.resolve('POST', '/api/v1/finance/task-links/query')!(event(
      'POST', '/api/v1/finance/task-links/query', { taskIds: [task.id] }, {}, 'phase-11-query',
    ));
    expect(JSON.parse(String(queried.body)).items[task.id]).toHaveLength(1);

    const replaced = await registry.resolve('PUT', linkPath)!(event(
      'PUT',
      linkPath,
      {
        expectedTaskVersion: 1,
        financeLinkSelections: [{ targetType: 'transaction', targetId: id(4) }],
      },
      { taskId: task.id },
      'phase-11-replace',
    ));
    expect(replaced.statusCode).toBe(200);
    expect(JSON.parse(String(replaced.body))).toMatchObject({
      links: [{ targetType: 'transaction', targetId: id(4) }],
      removedLinkIds: [attachedLink.id],
    });

    const reverse = await registry.resolve('GET', transactionPath)!(event(
      'GET', transactionPath, {}, { transactionId: id(4) }, 'phase-11-reverse',
    ));
    expect(JSON.parse(String(reverse.body)).tasks).toHaveLength(2);

    const replacementLink = JSON.parse(String(replaced.body)).links[0];
    const deletePath = '/api/v1/finance/tasks/{taskId}/finance-links/{linkId}';
    const removed = await registry.resolve('DELETE', deletePath)!(event(
      'DELETE', deletePath, { expectedVersion: 1 }, { taskId: task.id, linkId: replacementLink.id },
      'phase-11-unlink',
    ));
    expect(JSON.parse(String(removed.body))).toMatchObject({ status: 'removed', version: 2 });
  });

  it('creates a normal task with multiple links atomically while preserving sharing choices', () => {
    const { repository } = fixture();
    const result = createTaskWithFinanceLinks(repository, actor, {
      taskId: id(20),
      linkIds: [id(21), id(22)],
      task: { label: 'Private finance review', visibility: 'private', groupId: id(1) },
      selections: [
        { targetType: 'transaction', targetId: id(4) },
        { targetType: 'upcomingExpense', targetId: id(5) },
      ],
    }, 'phase-11-normal-create', new Date('2028-01-01T00:00:00.000Z'));
    expect(result).toMatchObject({
      taskId: id(20), linkStatus: 'applied', financialTaskLinkIds: [id(21), id(22)],
      task: { visibility: 'private', groupId: id(1) },
    });
    expect(JSON.stringify(result.task)).not.toMatch(/transaction|upcomingExpense|01J00000000000000000000004|01J00000000000000000000005/iu);
    expect(repository.tasks.size).toBe(2);
    expect(repository.financialTaskLinks.size).toBe(2);
    const replay = createTaskWithFinanceLinks(repository, actor, {
      taskId: id(99), linkIds: [id(97), id(98)], task: { label: 'Ignored retry' },
      selections: [{ targetType: 'transaction', targetId: id(4) }],
    }, 'phase-11-normal-create');
    expect(replay).toEqual(result);
  });

  it('routes normal task creation with preselected Finance targets as one applied receipt', async () => {
    const { repository } = fixture();
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository, actorFor: () => actor, now: () => new Date('2028-01-01T00:00:00.000Z'),
    });
    const path = '/api/v1/finance/tasks';
    const response = await registry.resolve('POST', path)!(event('POST', path, {
      task: { label: 'Review selected records', visibility: 'private', groupId: id(1) },
      financeLinkSelections: [
        { targetType: 'transaction', targetId: id(4) },
        { targetType: 'upcomingExpense', targetId: id(5) },
      ],
    }, {}, 'phase-11-linked-task'));
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(String(response.body))).toMatchObject({
      taskId: expect.any(String), linkStatus: 'applied',
      financialTaskLinkIds: [expect.any(String), expect.any(String)],
    });
    expect([...repository.tasks.values()].at(-1)).toMatchObject({ visibility: 'private', groupId: id(1) });
  });

  it('uses bounded task and target partitions instead of scanning relationship rows', async () => {
    const { repository, task } = fixture();
    const link = createAuthorizedFinancialTaskLink(
      repository, actor, task.id, { targetType: 'transaction', targetId: id(4) }, id(7), 1,
    );
    const calls: Array<Record<string, unknown>> = [];
    const reader = new FinanceReadRepository({
      tableName: 'test', cursorSecret: 'x'.repeat(32), authorize: async () => true,
      client: { send: async (command) => {
        const input = command.input as Record<string, unknown>;
        calls.push(input);
        const PK = (input.ExpressionAttributeValues as Record<string, string>)[':pk'];
        return { Items: [{ PK,
          SK: PK.startsWith('FINANCE#TASK#') ? `TARGET_LINK#${link.id}` : `TASK_LINK#${link.id}`,
          data: link }] };
      } },
    });
    expect((await reader.financialTaskLinksForTasks([task.id])).get(task.id)).toEqual([link]);
    expect(await reader.financialTaskLinksForTarget('transaction', id(4))).toEqual([link]);
    expect(calls).toHaveLength(2);
    expect(calls.every((input) => input.KeyConditionExpression ===
      'PK = :pk AND begins_with(SK, :prefix)')).toBe(true);
  });
});
