import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  financeBudgetAccountLinkInputSchema,
  financeBudgetActivityInputSchema,
  financeBudgetItemInputSchema,
  financeBudgetInputSchema,
  financeBudgetPatchSchema,
  financeReusableItemInputSchema,
  financeUpcomingExpenseCreateSchema,
  financeExpenseFulfillmentCreateSchema,
  manualFinanceTransactionReplayInputSchema,
} from '@naaseh/contracts';
import { ulidSchema, type Mutation, type StableMutationResult } from '@naaseh/domain';
import { createFinanceHandler } from './handler.js';
const financeHTTP = createFinanceHandler();
type ReplayResult = StableMutationResult & {
  problem?: { code: string; message: string; correlationId: string; retryAfterSeconds?: number };
};
const outcome = (
  event: APIGatewayProxyEventV2,
  id: string,
  status: ReplayResult['status'],
  code: string,
): ReplayResult => ({
  mutationId: id,
  status,
  problem: {
    code,
    message:
      status === 'retry'
        ? 'Finance replay is waiting. Your change remains saved.'
        : 'Review this saved Finance change after refreshing Finance.',
    correlationId: event.requestContext.requestId,
    ...(status === 'retry' ? { retryAfterSeconds: 30 } : {}),
  },
});

/** A deliberately narrow adapter. The existing HTTP boundary owns authorization and canonical commit. */
export async function dispatchFinanceReplay(
  event: APIGatewayProxyEventV2,
  mutation: Mutation,
  invoke: (event: APIGatewayProxyEventV2) => Promise<APIGatewayProxyResultV2> = financeHTTP,
): Promise<ReplayResult> {
  const budgetEdit = mutation.entityType === 'financeBudget' && mutation.operation === 'update';
  const budgetCreate = mutation.entityType === 'financeBudget' && mutation.operation === 'create';
  const budgetAccountLinkCreate =
    mutation.entityType === 'financeBudgetAccountLink' && mutation.operation === 'create';
  const budgetItemCreate =
    mutation.entityType === 'financeBudgetItem' && mutation.operation === 'create';
  const reusable = mutation.entityType === 'financeReusableItem' && mutation.operation === 'create';
  const manualTransaction =
    mutation.entityType === 'financeTransaction' && mutation.operation === 'create';
  const upcomingExpense =
    mutation.entityType === 'financeUpcomingExpense' && mutation.operation === 'create';
  const expenseFulfillment =
    mutation.entityType === 'financeFulfillment' && mutation.operation === 'create';
  if (
    !budgetEdit &&
    !budgetCreate &&
    !budgetAccountLinkCreate &&
    !budgetItemCreate &&
    !reusable &&
    !manualTransaction &&
    !upcomingExpense &&
    !expenseFulfillment
  )
    return outcome(event, mutation.id, 'retry', 'finance_replay_pending');
  const payload = mutation.payload;
  if (
    !ulidSchema.safeParse(mutation.id).success ||
    !ulidSchema.safeParse(mutation.entityId).success ||
    !Number.isSafeInteger(mutation.baseVersion) ||
    (budgetEdit ? mutation.baseVersion < 1 : mutation.baseVersion !== 0) ||
    !payload ||
    typeof payload !== 'object' ||
    Array.isArray(payload)
  )
    return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
  const object = payload as Record<string, unknown>;
  const budgetActivity = budgetEdit && Object.hasOwn(object, 'activity');
  let input: Record<string, unknown>;
  if (budgetEdit) {
    if (object.expectedVersion !== undefined && object.expectedVersion !== mutation.baseVersion)
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = { ...object, expectedVersion: mutation.baseVersion };
  } else if (budgetCreate) {
    const { id, version, ...business } = object;
    if (
      (id !== undefined && id !== mutation.entityId) ||
      (version !== undefined && version !== 1) ||
      object.status === 'archived'
    )
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = business;
  } else if (budgetAccountLinkCreate) {
    const principal = (event.requestContext as { authorizer?: { lambda?: { userId?: string } } })
      .authorizer?.lambda?.userId;
    const { id, budgetId, status, version, createdBy, expectedBudgetVersion, ...business } = object;
    if (
      (id !== undefined && id !== mutation.entityId) ||
      !ulidSchema.safeParse(budgetId).success ||
      (version !== undefined && version !== 1) ||
      (status !== undefined && status !== 'active') ||
      (createdBy !== undefined && createdBy !== 'pending' && createdBy !== principal) ||
      !Number.isSafeInteger(expectedBudgetVersion) ||
      Number(expectedBudgetVersion) < 1
    )
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = { ...business, id: mutation.entityId, expectedBudgetVersion };
  } else if (budgetItemCreate) {
    const principal = (event.requestContext as { authorizer?: { lambda?: { userId?: string } } })
      .authorizer?.lambda?.userId;
    const { id, budgetId, creatorId, status, version, expectedBudgetVersion, ...business } = object;
    if (
      (id !== undefined && id !== mutation.entityId) ||
      !ulidSchema.safeParse(budgetId).success ||
      (version !== undefined && version !== 1) ||
      (status !== undefined && status !== 'active') ||
      (creatorId !== undefined && creatorId !== 'pending' && creatorId !== principal) ||
      !Number.isSafeInteger(expectedBudgetVersion) ||
      Number(expectedBudgetVersion) < 1
    )
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = { ...business, id: mutation.entityId, expectedBudgetVersion };
  } else if (reusable) {
    const principal = (event.requestContext as { authorizer?: { lambda?: { userId?: string } } })
      .authorizer?.lambda?.userId;
    const { id, creatorId, status, version, ...business } = object;
    if (
      (id !== undefined && id !== mutation.entityId) ||
      (version !== undefined && version !== 1) ||
      (status !== undefined && status !== 'active') ||
      (creatorId !== undefined && creatorId !== 'pending' && creatorId !== principal)
    )
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = business;
  } else if (manualTransaction) {
    const { id, accountId, ...business } = object;
    if (
      !ulidSchema.safeParse(accountId).success ||
      (id !== undefined && id !== mutation.entityId)
    ) {
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    }
    input = { ...business, id: mutation.entityId };
  } else if (upcomingExpense) {
    if (object.id !== undefined && object.id !== mutation.entityId)
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = { ...object, id: mutation.entityId };
  } else {
    const { upcomingExpenseId, proposalStatus, ...business } = object;
    if (
      !ulidSchema.safeParse(upcomingExpenseId).success ||
      (object.id !== undefined && object.id !== mutation.entityId) ||
      (proposalStatus !== undefined && proposalStatus !== 'pending-server-acceptance')
    )
      return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
    input = { ...business, id: mutation.entityId };
  }
  const schema = budgetEdit
    ? budgetActivity
      ? financeBudgetActivityInputSchema
      : financeBudgetPatchSchema
    : budgetCreate
      ? financeBudgetInputSchema
      : budgetAccountLinkCreate
        ? financeBudgetAccountLinkInputSchema
        : budgetItemCreate
          ? financeBudgetItemInputSchema
          : manualTransaction
            ? manualFinanceTransactionReplayInputSchema
            : upcomingExpense
              ? financeUpcomingExpenseCreateSchema
              : expenseFulfillment
                ? financeExpenseFulfillmentCreateSchema
                : financeReusableItemInputSchema;
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
  const forwardedInput = budgetActivity ? { expectedVersion: mutation.baseVersion } : parsed.data;
  const response = await invoke({
    ...event,
    rawPath:
      budgetEdit || budgetCreate
        ? budgetActivity
          ? `/api/v1/finance/budgets/${mutation.entityId}/${String(input.activity) === 'active' ? 'reactivate' : 'deactivate'}`
          : `/api/v1/finance/budgets/${mutation.entityId}`
        : budgetAccountLinkCreate
          ? `/api/v1/finance/budgets/${String(object.budgetId)}/accounts`
          : budgetItemCreate
            ? `/api/v1/finance/budgets/${String(object.budgetId)}/items`
            : manualTransaction
              ? `/api/v1/finance/accounts/${String(object.accountId)}/transactions`
              : upcomingExpense
                ? '/api/v1/finance/upcoming-expenses'
                : expenseFulfillment
                  ? `/api/v1/finance/upcoming-expenses/${String(object.upcomingExpenseId)}/fulfillments`
                  : `/api/v1/finance/reusable-items/${mutation.entityId}`,
    body: JSON.stringify(forwardedInput),
    isBase64Encoded: false,
    requestContext: {
      ...event.requestContext,
      http: {
        ...event.requestContext.http,
        method: budgetEdit && !budgetActivity ? 'PATCH' : 'POST',
      },
    },
    headers: {
      ...event.headers,
      'idempotency-key': `${budgetEdit ? 'finance-sync-budget-edit' : budgetCreate ? 'finance-sync-budget-create' : budgetAccountLinkCreate ? 'finance-sync-budget-account-link-create' : budgetItemCreate ? 'finance-sync-budget-item-create' : manualTransaction ? 'finance-sync-manual-transaction-create' : 'finance-sync-reusable-create'}:${mutation.id}`,
      'x-finance-sync-replay': budgetEdit
        ? budgetActivity
          ? 'budget-activity-v1'
          : 'budget-edit-v1'
        : budgetCreate
          ? 'budget-create-v1'
          : budgetAccountLinkCreate
            ? 'budget-account-link-create-v1'
            : budgetItemCreate
              ? 'budget-item-create-v1'
              : manualTransaction
                ? 'manual-transaction-create-v1'
                : upcomingExpense
                  ? 'upcoming-expense-create-v1'
                  : expenseFulfillment
                    ? 'expense-fulfillment-create-v1'
                    : 'reusable-create-v1',
    },
  });
  if (!response || typeof response !== 'object')
    return outcome(event, mutation.id, 'retry', 'finance_replay_unavailable');
  const status = response.statusCode ?? 500;
  if (status >= 200 && status < 300) {
    try {
      const body = JSON.parse(response.body ?? '{}') as {
        id?: unknown;
        version?: unknown;
        expense?: { id?: unknown; version?: unknown };
        fulfillments?: Array<{ id?: unknown; version?: unknown }>;
      };
      const acknowledged = upcomingExpense
        ? body.expense
        : expenseFulfillment
          ? body.fulfillments?.find(({ id }) => id === mutation.entityId)
          : body;
      if (
        acknowledged?.id !== mutation.entityId ||
        typeof acknowledged.version !== 'number' ||
        !Number.isSafeInteger(acknowledged.version) ||
        acknowledged.version <= mutation.baseVersion ||
        ((reusable ||
          manualTransaction ||
          budgetCreate ||
          budgetAccountLinkCreate ||
          budgetItemCreate ||
          upcomingExpense ||
          expenseFulfillment) &&
          acknowledged.version !== 1)
      )
        throw new Error('Invalid Finance replay acknowledgement');
      return {
        mutationId: mutation.id,
        status:
          String(response.headers?.['x-finance-sync-replayed']) === '1'
            ? 'alreadyApplied'
            : 'applied',
        version: acknowledged.version,
      };
    } catch {
      return outcome(event, mutation.id, 'retry', 'finance_replay_unavailable');
    }
  }
  // Do not copy a problem title/body or a protected model into a conflict response.
  if (status === 409 || status === 404)
    return outcome(
      event,
      mutation.id,
      'conflict',
      status === 404 ? 'finance_replay_access_changed' : 'finance_replay_conflict',
    );
  if (status === 400 || status === 422)
    return outcome(event, mutation.id, 'rejected', 'finance_replay_validation_failed');
  return outcome(event, mutation.id, 'retry', 'finance_replay_unavailable');
}
