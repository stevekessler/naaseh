import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  financeExpenseFulfillmentCreateSchema,
  financeExpenseFulfillmentDeleteSchema,
  financeUpcomingExpenseCancelSchema,
  financeUpcomingExpenseCreateSchema,
  financeUpcomingExpenseReopenSchema,
  financeUpcomingExpenseUpdateSchema,
} from '@naaseh/contracts';
import { createUlid } from '@naaseh/domain';
import { json } from '../shared/http.js';
import type { FinanceActor } from './authorization.js';
import type { FinanceRouteRegistry } from './handlers.js';
import type { FinanceMemoryRepository } from './repository.js';
import {
  cancelUpcomingExpenseRecord,
  createUpcomingExpenseRecord,
  getUpcomingExpenseRecord,
  linkUpcomingExpenseFulfillment,
  listUpcomingExpenseRecords,
  reopenUpcomingExpenseRecord,
  rescheduleUpcomingExpenseRecord,
  unlinkUpcomingExpenseFulfillment,
  updateUpcomingExpenseRecord,
} from './upcoming-expense-service.js';

export interface UpcomingExpenseRouteDependencies {
  repository: FinanceMemoryRepository;
  actorFor: (event: APIGatewayProxyEventV2) => Promise<FinanceActor> | FinanceActor;
}

const bodyOf = (event: APIGatewayProxyEventV2) => JSON.parse(event.body ?? '{}') as unknown;
const parameter = (event: APIGatewayProxyEventV2, name: string) => {
  const value = event.pathParameters?.[name];
  if (!value) throw new Error(`Missing Finance route parameter ${name}.`);
  return value;
};
const mutationId = (event: APIGatewayProxyEventV2) =>
  event.headers['idempotency-key'] ?? createUlid();

/** Register the upcoming-expense surface separately so other Finance stories can merge cleanly. */
export function registerUpcomingExpenseRoutes(
  registry: FinanceRouteRegistry,
  dependencies: UpcomingExpenseRouteDependencies,
) {
  const { repository } = dependencies;
  registry.register('GET', '/api/v1/finance/upcoming-expenses', async (event) => {
    const actor = await dependencies.actorFor(event);
    const accountId = event.queryStringParameters?.accountId;
    const includeClosed = event.queryStringParameters?.includeClosed === 'true';
    return json(200, {
      items: listUpcomingExpenseRecords(repository, actor, {
        ...(accountId ? { accountId } : {}),
        ...(includeClosed ? { includeClosed } : {}),
      }),
    });
  });
  registry.register('POST', '/api/v1/finance/upcoming-expenses', async (event) => {
    const actor = await dependencies.actorFor(event);
    const input = financeUpcomingExpenseCreateSchema.parse(bodyOf(event));
    return json(
      201,
      createUpcomingExpenseRecord(
        repository,
        actor,
        {
          groupId: input.groupId,
          accountId: input.accountId,
          budgetId: input.budgetId,
          description: input.description,
          expectedAmountMinor: input.expectedAmountMinor,
          dueDate: input.dueDate,
          entryContext: input.entryContext,
          ...(input.id ? { id: input.id } : {}),
          ...(input.plannedSource ? { plannedSource: input.plannedSource } : {}),
        },
        mutationId(event),
      ),
    );
  });
  registry.register('GET', '/api/v1/finance/upcoming-expenses/{expenseId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const result = getUpcomingExpenseRecord(repository, actor, parameter(event, 'expenseId'));
    if (!result) throw new Error('Finance record not found.');
    return json(200, result);
  });
  registry.register('PATCH', '/api/v1/finance/upcoming-expenses/{expenseId}', async (event) => {
    const actor = await dependencies.actorFor(event);
    const expenseId = parameter(event, 'expenseId');
    const input = financeUpcomingExpenseUpdateSchema.parse(bodyOf(event));
    const key = mutationId(event);
    const { dueDate, dateChangeContext } = input;
    const fields = {
      expectedVersion: input.expectedVersion,
      ...(input.description === undefined ? {} : { description: input.description }),
      ...(input.expectedAmountMinor === undefined
        ? {}
        : { expectedAmountMinor: input.expectedAmountMinor }),
      ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
      ...(input.budgetId === undefined ? {} : { budgetId: input.budgetId }),
      ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
      ...(input.plannedSource === undefined ? {} : { plannedSource: input.plannedSource }),
    };
    const hasFieldUpdate = Object.keys(fields).some((name) => name !== 'expectedVersion');
    const first = hasFieldUpdate
      ? updateUpcomingExpenseRecord(repository, actor, expenseId, fields, `${key}:fields`)
      : undefined;
    const result = dueDate
      ? rescheduleUpcomingExpenseRecord(
          repository,
          actor,
          expenseId,
          {
            dueDate,
            dateChangeContext: dateChangeContext!,
            expectedVersion: first?.expense.version ?? input.expectedVersion,
          },
          `${key}:date`,
        )
      : first;
    if (!result) throw new Error('Upcoming expense update must change at least one field.');
    return json(200, result);
  });
  registry.register(
    'POST',
    '/api/v1/finance/upcoming-expenses/{expenseId}/cancel',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = financeUpcomingExpenseCancelSchema.parse(bodyOf(event));
      return json(
        200,
        cancelUpcomingExpenseRecord(
          repository,
          actor,
          parameter(event, 'expenseId'),
          input.expectedVersion,
          mutationId(event),
        ),
      );
    },
  );
  registry.register(
    'POST',
    '/api/v1/finance/upcoming-expenses/{expenseId}/reopen',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = financeUpcomingExpenseReopenSchema.parse(bodyOf(event));
      return json(
        200,
        reopenUpcomingExpenseRecord(
          repository,
          actor,
          parameter(event, 'expenseId'),
          input,
          mutationId(event),
        ),
      );
    },
  );
  registry.register(
    'POST',
    '/api/v1/finance/upcoming-expenses/{expenseId}/fulfillments',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = financeExpenseFulfillmentCreateSchema.parse(bodyOf(event));
      return json(
        201,
        linkUpcomingExpenseFulfillment(
          repository,
          actor,
          parameter(event, 'expenseId'),
          {
            transactionId: input.transactionId,
            amountMinor: input.amountMinor,
            expectedExpenseVersion: input.expectedExpenseVersion,
            expectedTransactionVersion: input.expectedTransactionVersion,
            expectedClaimVersion: input.expectedClaimVersion,
            ...(input.id ? { id: input.id } : {}),
          },
          mutationId(event),
        ),
      );
    },
  );
  registry.register(
    'DELETE',
    '/api/v1/finance/upcoming-expenses/{expenseId}/fulfillments/{fulfillmentId}',
    async (event) => {
      const actor = await dependencies.actorFor(event);
      const input = financeExpenseFulfillmentDeleteSchema.parse(bodyOf(event));
      return json(
        200,
        unlinkUpcomingExpenseFulfillment(
          repository,
          actor,
          parameter(event, 'expenseId'),
          parameter(event, 'fulfillmentId'),
          input,
          mutationId(event),
        ),
      );
    },
  );
  return registry;
}
