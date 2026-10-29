import { describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { createBudget, createBudgetItem } from '@naaseh/domain';
import {
  FinanceMemoryRepository,
  buildFinancialTaskCreationTransaction,
} from '../../apps/api/src/finance/repository.js';
import {
  FinanceRouteRegistry,
  registerUserStory1FinanceRoutes,
} from '../../apps/api/src/finance/handlers.js';
import { createFinanceHandler } from '../../apps/api/src/finance/handler.js';
import {
  authorizedFinancialTaskLinkForTask,
  createTaskFromFinanceBudgetItem,
} from '../../apps/api/src/finance/task-link-service.js';

const ids = {
  group: '01J00000000000000000000821',
  budget: '01J00000000000000000000822',
  item: '01J00000000000000000000823',
  task: '01J00000000000000000000824',
  link: '01J00000000000000000000825',
};
const actor = {
  id: 'member',
  role: 'user' as const,
  active: true,
  groupMemberships: [{ groupId: ids.group, role: 'member' as const }],
};

function fixture() {
  const repository = new FinanceMemoryRepository();
  repository.budgets.set(
    ids.budget,
    createBudget({
      id: ids.budget,
      groupId: ids.group,
      name: 'January plan',
      budgetDate: '2028-01-01',
      startDate: '2028-01-01',
      endDate: '2028-01-31',
      status: 'active',
    }),
  );
  repository.budgetItems.set(
    ids.item,
    createBudgetItem({
      id: ids.item,
      budgetId: ids.budget,
      description: 'Utility bill',
      financeCategoryId: '01J00000000000000000000826',
      plannedAmountMinor: -10_000,
      currency: 'USD',
      relatedAccountIds: [],
      creatorId: actor.id,
    }),
  );
  return repository;
}

const request = (
  method: string,
  routePath: string,
  body: unknown,
  pathParameters: Record<string, string>,
  idempotencyKey = 'finance-task-link-route-1',
) =>
  ({
    version: '2.0',
    routeKey: `${method} ${routePath}`,
    rawPath: routePath,
    rawQueryString: '',
    headers: {
      origin: 'http://localhost:4173',
      'x-csrf-token': 'csrf',
      'idempotency-key': idempotencyKey,
    },
    requestContext: {
      requestId: 'task-link-request',
      http: {
        method,
        path: routePath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      routeKey: `${method} ${routePath}`,
      stage: '$default',
      time: '',
      timeEpoch: 0,
      authorizer: { lambda: { userId: actor.id, csrfToken: 'csrf' } },
    },
    body: JSON.stringify(body),
    pathParameters,
    isBase64Encoded: false,
  }) as APIGatewayProxyEventV2;

describe('Finance task-link integration', () => {
  it('creates the task and Finance link together with isolated feeds and safe replay', () => {
    const repository = fixture();
    const input = {
      taskId: ids.task,
      linkId: ids.link,
      label: 'Pay utility bill',
      assigneeId: actor.id,
      dueDate: '2028-01-15',
    };
    const first = createTaskFromFinanceBudgetItem(
      repository,
      actor,
      ids.item,
      input,
      'task-link-mutation-1',
      new Date('2028-01-01T00:00:00.000Z'),
    );
    const replay = createTaskFromFinanceBudgetItem(
      repository,
      actor,
      ids.item,
      { ...input, taskId: '01J00000000000000000000827', linkId: '01J00000000000000000000828' },
      'task-link-mutation-1',
    );
    expect(replay).toEqual(first);
    expect(repository.tasks.size).toBe(1);
    expect(repository.financialTaskLinks.size).toBe(1);
    const taskFeed = repository.feedChanges.find(({ entityType }) => entityType === 'task');
    const financeFeed = repository.feedChanges.find(
      ({ entityType }) => entityType === 'financeTaskLink',
    );
    expect(taskFeed).toMatchObject({ audience: 'PUBLIC', entityId: ids.task });
    expect(JSON.stringify(taskFeed)).not.toContain(ids.item);
    expect(financeFeed).toMatchObject({ audience: `GROUP#${ids.group}`, entityId: ids.link });
    expect(authorizedFinancialTaskLinkForTask(repository, actor, ids.task)?.id).toBe(ids.link);
  });

  it('leaves no partial task when authorization or item validation fails', () => {
    const repository = fixture();
    expect(() =>
      createTaskFromFinanceBudgetItem(
        repository,
        { ...actor, groupMemberships: [] },
        ids.item,
        { taskId: ids.task, linkId: ids.link, label: 'Pay', assigneeId: actor.id },
        'task-link-mutation-2',
      ),
    ).toThrow('Finance record not found.');
    expect(repository.tasks.size).toBe(0);
    expect(repository.financialTaskLinks.size).toBe(0);
  });

  it('builds one conditional transaction containing ordinary task and Finance-link records', () => {
    const repository = fixture();
    const created = createTaskFromFinanceBudgetItem(
      repository,
      actor,
      ids.item,
      { taskId: ids.task, linkId: ids.link, label: 'Pay', assigneeId: actor.id },
      'task-link-mutation-3',
      new Date('2028-01-01T00:00:00.000Z'),
    );
    const transaction = buildFinancialTaskCreationTransaction({
      task: created.task,
      link: created.link,
      mutationId: 'task-link-mutation-3',
      revision: {
        id: '01J00000000000000000000829',
        taskId: ids.task,
        mutationId: 'task-link-mutation-3',
        actorId: actor.id,
        version: 1,
        changedAt: '2028-01-01T00:00:00.000Z',
        operation: 'create',
        changedFields: ['label'],
        after: { label: 'Pay' },
        syncOutcome: 'applied',
      },
      feedChanges: [],
    });
    const puts = transaction.TransactItems?.flatMap((item) => (item.Put ? [item.Put] : [])) ?? [];
    expect(puts.some(({ Item }) => Item?.PK === `TASK#${ids.task}` && Item?.SK === 'CURRENT')).toBe(
      true,
    );
    expect(
      puts.some(
        ({ Item }) =>
          Item?.PK === `FINANCE#BUDGET#${ids.budget}` && Item?.SK === `TASK_LINK#${ids.link}`,
      ),
    ).toBe(true);
    expect(puts.every(({ ConditionExpression }) => Boolean(ConditionExpression))).toBe(true);
  });

  it('routes redacted creation, idempotent replay, and task-link tombstoning', async () => {
    const repository = fixture();
    const manager = {
      ...actor,
      groupMemberships: [{ groupId: ids.group, role: 'manager' as const }],
    };
    const registry = registerUserStory1FinanceRoutes(new FinanceRouteRegistry(), {
      repository,
      actorFor: () => manager,
      deletionSigningSecret: 'task-link-secret',
      allowedSimplefinHosts: ['bridge.simplefin.org'],
      now: () => new Date('2028-01-01T00:00:00.000Z'),
    });
    const handler = createFinanceHandler(registry);
    const routePath = '/api/v1/finance/budget-items/{budgetItemId}/tasks';
    const event = request(
      'POST',
      routePath,
      {
        label: 'Pay utility bill',
        assigneeId: actor.id,
        dueDate: '2028-01-15',
      },
      { budgetItemId: ids.item },
    );
    const created = await handler(event);
    const response = JSON.parse(('body' in created ? created.body : '') ?? '{}') as Record<
      string,
      unknown
    >;
    expect(created.statusCode).toBe(201);
    expect(response).toEqual({
      taskId: expect.any(String),
      financialTaskLinkId: expect.any(String),
    });
    expect(JSON.stringify(response)).not.toMatch(/amount|merchant|budget/iu);
    expect((await handler(event)).statusCode).toBe(200);
    expect(repository.tasks.size).toBe(1);

    const linkId = String(response.financialTaskLinkId);
    const previewPath = '/api/v1/finance/records/{recordType}/{recordId}/deletion-preview';
    const previewResponse = await handler(
      request(
        'GET',
        previewPath,
        {},
        {
          recordType: 'task-link',
          recordId: linkId,
        },
        'finance-task-link-preview',
      ),
    );
    const preview = JSON.parse(
      ('body' in previewResponse ? previewResponse.body : '') ?? '{}',
    ) as Record<string, unknown>;
    expect(preview).toMatchObject({
      outcome: 'tombstone',
      dependentCounts: { task: 1, budgetItem: 1 },
    });
    const deletePath = '/api/v1/finance/records/{recordType}/{recordId}/deletion';
    const deleted = await handler(
      request(
        'POST',
        deletePath,
        {
          expectedVersion: preview.expectedVersion,
          confirmationToken: preview.confirmationToken,
        },
        { recordType: 'task-link', recordId: linkId },
        'finance-task-link-delete',
      ),
    );
    expect(deleted.statusCode).toBe(200);
    expect(repository.financialTaskLinks.get(linkId)).toMatchObject({
      status: 'removed',
      version: 2,
    });
    expect(repository.tasks.size).toBe(1);
  });
});
