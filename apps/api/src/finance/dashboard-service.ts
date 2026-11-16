import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  financeDashboardBudgetResponseSchema,
  financeSpendTrendRequestSchema,
} from '@naaseh/contracts';
import {
  deriveUpcomingExpenseState,
  expenseFulfillmentSchema,
  financeTrendPeriods,
  isBudgetEligibleForNewUpcoming,
  localFinanceDate,
  upcomingExpenseSchema,
  type Budget,
  type ExpenseFulfillment,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { SafeApiError } from '../shared/http.js';
import { listFinanceBrowseKeys, type createFinanceQueryRuntime } from './query-runtime.js';
import { FinanceSyncSourceGuard } from './sync-source-guard.js';

async function budgetRows(
  groupId: string,
  collection: 'budgetItems' | 'budgetAccountLinks',
  budgetId: string,
) {
  const items: string[] = [];
  let cursor: Record<string, unknown> | undefined;
  for (let page = 0; page < 10; page++) {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        FilterExpression: '#data.budgetId = :budget AND #data.#status = :active',
        ExpressionAttributeNames: { '#data': 'data', '#status': 'status' },
        ExpressionAttributeValues: {
          ':pk': `FINANCE#SCOPE#GROUP#${groupId}`,
          ':prefix': `ROW#${collection}#`,
          ':budget': budgetId,
          ':active': 'active',
        },
        ProjectionExpression: 'entryKey',
        ConsistentRead: true,
        Limit: 100,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    for (const row of result.Items ?? [])
      if (typeof row.entryKey === 'string') items.push(row.entryKey);
    if (items.length > 100) break;
    cursor = result.LastEvaluatedKey;
    if (!cursor) return items;
  }
  throw new SafeApiError(
    409,
    'finance_dashboard_budget_bound',
    'The budget is too large to summarize.',
    'conflict',
  );
}

export async function readDashboardBudget(userId: string, budgetId: string) {
  const guard = new FinanceSyncSourceGuard({ userId, role: 'user' });
  const budget = (await guard.readCanonicalSource('financeBudget', budgetId)) as Budget | undefined;
  if (!budget || !isBudgetEligibleForNewUpcoming(budget)) return null;
  const [links, items] = await Promise.all([
    budgetRows(budget.groupId, 'budgetAccountLinks', budgetId),
    budgetRows(budget.groupId, 'budgetItems', budgetId),
  ]);
  const visible = new Set<string>();
  let complete = true;
  for (const id of links) {
    const link = await guard.readCanonicalSource('financeBudgetAccountLink', id);
    if (
      link?.budgetId === budgetId &&
      link.status === 'active' &&
      typeof link.accountId === 'string'
    )
      visible.add(link.accountId);
    else complete = false;
  }
  const plans = [];
  for (const id of items) {
    const item = await guard.readCanonicalSource('financeBudgetItem', id);
    if (
      item?.budgetId !== budgetId ||
      item.status !== 'active' ||
      !Array.isArray(item.relatedAccountIds) ||
      !item.relatedAccountIds.every((accountId) => visible.has(accountId))
    ) {
      complete = false;
      continue;
    }
    const { currency, currencyExponent, plannedAmountMinor } = item;
    plans.push({ id, currency, currencyExponent, plannedAmountMinor });
  }
  await guard.assertCurrent();
  return financeDashboardBudgetResponseSchema.parse({
    id: budget.id,
    name: budget.name,
    startDate: budget.startDate,
    ...(budget.endDate ? { endDate: budget.endDate } : {}),
    items: plans,
    accountIds: [...visible],
    complete,
  });
}

export async function startSpendTrendPeriod(
  runtime: Pick<ReturnType<typeof createFinanceQueryRuntime>, 'start'>,
  userId: string,
  securityRevision: number,
  input: unknown,
  requestId: string,
  now = new Date().toISOString(),
) {
  const request = financeSpendTrendRequestSchema.parse(input);
  const period = financeTrendPeriods(request.mode, request.timeZone, now)[request.period];
  if (!period)
    throw new SafeApiError(
      400,
      'finance_trend_period',
      'Choose a valid period for this view.',
      'validation',
    );
  const { dateFrom, dateTo } = period;
  const queryId = await runtime.start(
    userId,
    securityRevision,
    {
      accountIds: request.accountIds,
      filters: { postedSpendOnly: true, dateFrom, dateTo, timeZone: request.timeZone },
    },
    requestId,
  );
  return { queryId, dateFrom, dateTo };
}

export async function readDashboardUpcoming(userId: string, guard: FinanceSyncSourceGuard) {
  const [expenseIds, claimIds] = await Promise.all([
    listFinanceBrowseKeys(userId, 'upcomingExpenses'),
    listFinanceBrowseKeys(userId, 'expenseFulfillments'),
  ]);
  const claims = new Map<string, ExpenseFulfillment[]>();
  for (const id of claimIds) {
    const row = await guard.readCanonicalSource('financeFulfillment', id);
    if (!row) continue;
    const claim = expenseFulfillmentSchema.parse(row);
    const group = claims.get(claim.upcomingExpenseId) ?? [];
    group.push(claim);
    claims.set(claim.upcomingExpenseId, group);
  }
  const today = localFinanceDate(new Date().toISOString(), 'UTC');
  const items = [];
  for (const id of expenseIds) {
    const row = await guard.readCanonicalSource('financeUpcomingExpense', id);
    if (!row) continue;
    const expense = upcomingExpenseSchema.parse(row);
    const fulfillments = claims.get(id) ?? [];
    const totals = deriveUpcomingExpenseState(expense, fulfillments, today);
    if (totals.state === 'paid' || totals.state === 'cancelled') continue;
    items.push({ expense, fulfillments: [], claimVersions: {}, ...totals });
  }
  return items;
}
