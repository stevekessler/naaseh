import { createHash } from 'node:crypto';
import { QueryCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import { financeForecastRequestSchema, financeForecastResultSchema } from '@naaseh/contracts';
import {
  addMinorUnits,
  calculateBudgetForecast,
  deriveUpcomingExpenseState,
  expenseFulfillmentSchema,
  forecastHistoryWindow,
  isPostedSpendSource,
  localFinanceDate,
  plannedSourceIdentity,
  resolveForecastWindow,
  upcomingExpenseSchema,
  type Budget,
  type BudgetHistoryAssignment,
  type BudgetHistoryCandidate,
  type BudgetItem,
  type ForecastActivity,
  type ForecastObligation,
  type ExpenseFulfillment,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { SafeApiError } from '../shared/http.js';
import { loadCanonicalFinanceFact } from './canonical-spend-source.js';
import { budgetRows } from './dashboard-service.js';
import { listFinanceBrowseKeys, readFinanceForecastAccountCoverage } from './query-runtime.js';
import { readFinanceForecastReferences } from './read-repository.js';
import { FinanceSyncSourceGuard } from './sync-source-guard.js';

const maxHistoryReferences = 100;
const unavailable = () =>
  new SafeApiError(
    409,
    'finance_forecast_changed',
    'Finance changed. Try the forecast again.',
    'conflict',
  );

async function inBatches<T, R>(values: readonly T[], read: (value: T) => Promise<R>) {
  const result: R[] = [];
  for (let offset = 0; offset < values.length; offset += 5)
    result.push(...(await Promise.all(values.slice(offset, offset + 5).map(read))));
  return result;
}

const scopeMeta = async (PK: string) =>
  (
    await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK, SK: 'META' },
        ConsistentRead: true,
      }),
    )
  ).Item?.revision as number | undefined;

async function budgetSourceRows(PK: string, collection: string) {
  const page = await dynamodb.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#' + collection + '#' },
      ProjectionExpression: 'entryKey, #d.budgetId, #d.upcomingExpenseId',
      ExpressionAttributeNames: { '#d': 'data' },
      Limit: 100,
      ConsistentRead: true,
    }),
  );
  return { rows: page.Items ?? [], complete: !page.LastEvaluatedKey };
}

async function upcomingPlans(
  guard: FinanceSyncSourceGuard,
  scopes: readonly string[],
  budgetId: string,
  asOfDate: string,
) {
  const pages = await Promise.all(
    scopes.map((scope) => budgetSourceRows(scope, 'upcomingExpenses')),
  );
  const ids = new Set(
    pages.flatMap((page) =>
      page.rows.filter((row) => row.data?.budgetId === budgetId).map((row) => String(row.entryKey)),
    ),
  );
  const read = await inBatches([...ids], async (id) => {
    const value = await guard.readCanonicalSource('financeUpcomingExpense', id);
    return value?.budgetId === budgetId ? upcomingExpenseSchema.parse(value) : undefined;
  });
  const expenses = read.filter((value) => value !== undefined);
  if (!expenses.length)
    return { rows: [], complete: pages.every((page) => page.complete) && !ids.size };
  const claimPages = await Promise.all(
    scopes.map((scope) => budgetSourceRows(scope, 'expenseFulfillments')),
  );
  const expenseIds = new Set(expenses.map(({ id }) => id));
  const claimIds = new Set(
    claimPages.flatMap((page) =>
      page.rows
        .filter((row) => expenseIds.has(row.data?.upcomingExpenseId))
        .map((row) => String(row.entryKey)),
    ),
  );
  const byExpense = new Map<string, ExpenseFulfillment[]>();
  let complete =
    [...pages, ...claimPages].every((page) => page.complete) && expenses.length === ids.size;
  for (const claim of await inBatches([...claimIds], (id) =>
    guard.readCanonicalSource('financeFulfillment', id),
  )) {
    if (!claim) {
      complete = false;
      continue;
    }
    const value = expenseFulfillmentSchema.parse(claim);
    const group = byExpense.get(value.upcomingExpenseId) ?? [];
    group.push(value);
    byExpense.set(value.upcomingExpenseId, group);
  }
  const rows = expenses.map((expense): ForecastObligation => {
    const { state, remainingAmountMinor } = deriveUpcomingExpenseState(
      expense,
      byExpense.get(expense.id) ?? [],
      asOfDate,
    );
    return {
      id: expense.plannedSource
        ? plannedSourceIdentity(expense.plannedSource)
        : 'expense:' + expense.id,
      source: 'upcoming',
      dueDate: expense.dueDate,
      kind: 'expense',
      currency: expense.currency,
      remainingMinor: state === 'cancelled' ? 0 : remainingAmountMinor,
    };
  });
  return { rows, complete };
}

export async function readFinanceBudgetForecast(input: {
  userId: string;
  securityRevision: number;
  budgetId: string;
  request: unknown;
  now?: string;
}) {
  const { userId, budgetId, securityRevision, now = new Date().toISOString() } = input;
  const request = financeForecastRequestSchema.parse(input.request);
  const asOfDate = localFinanceDate(now, request.timeZone);
  const guard = new FinanceSyncSourceGuard({ userId, role: 'user' });
  const budget = (await guard.readCanonicalSource('financeBudget', budgetId)) as Budget | undefined;
  if (!budget)
    throw new SafeApiError(404, 'finance_not_found', 'Finance record not found.', 'authorization');
  const window = resolveForecastWindow({
    budgetStart: budget.startDate,
    budgetEnd: budget.endDate,
    asOfDate,
    ...(request.dateFrom && request.dateTo
      ? { custom: { dateFrom: request.dateFrom, dateTo: request.dateTo } }
      : {}),
  });
  const history = request.method === 'historical' ? forecastHistoryWindow(asOfDate) : undefined;
  const scopes = ['FINANCE#SCOPE#GROUP#' + budget.groupId, 'FINANCE#SCOPE#OWNER#' + userId];
  const scopeRevisions = await Promise.all(scopes.map(scopeMeta));
  const [accountIds, links] = await Promise.all([
    listFinanceBrowseKeys(userId, 'accounts'),
    budgetRows(budget.groupId, 'budgetAccountLinks', budgetId),
  ]);
  const accountKeys = [...new Set(accountIds)].sort();
  const authorized = new Set(
    (
      await inBatches(accountKeys, async (id) =>
        (await guard.readCanonicalSource('financeAccount', id)) ? id : undefined,
      )
    ).filter((id) => id !== undefined),
  );
  const linkRows = await inBatches(links, (id) =>
    guard.readCanonicalSource('financeBudgetAccountLink', id),
  );
  const linked = new Set(
    linkRows.flatMap((link) =>
      link?.budgetId === budgetId &&
      typeof link.accountId === 'string' &&
      authorized.has(link.accountId)
        ? [link.accountId]
        : [],
    ),
  );
  const coverage = await readFinanceForecastAccountCoverage(userId, [...authorized]);
  const revisions = new Map(coverage.revisions);
  const candidates: BudgetHistoryCandidate<ForecastActivity>[] = [];
  const usedByItem = new Map<string, number>();
  const observedFrom = new Map<string, string>();
  const observedAccounts = new Set(linked);
  const dates = [window.dateFrom, ...(history ? [history.dateFrom] : [budget.startDate])].sort();
  const ends = [
    window.dateTo < asOfDate ? window.dateTo : asOfDate,
    ...(history ? [history.dateTo] : []),
  ].sort();
  const limit = Math.floor(maxHistoryReferences / Math.max(authorized.size, 1));
  let complete = linkRows.every((link) => link && linked.has(String(link.accountId)));
  const scanned = await inBatches([...authorized], async (id) => {
    if (!revisions.has(id)) return { accountId: id, ids: [], complete: false };
    if (dates[0]! > ends.at(-1)!) return { accountId: id, ids: [], complete: true };
    return {
      accountId: id,
      ...(await readFinanceForecastReferences(
        dynamodb,
        tableName,
        id,
        dates[0]!,
        ends.at(-1)!,
        limit,
      )),
    };
  });
  const checkedDependencies = new Map<string, number>();
  const itemCache = new Map<string, Promise<Record<string, unknown> | undefined>>();
  const readItem = (id: string) => {
    let entry = itemCache.get(id);
    if (!entry) {
      entry = guard.readCanonicalSource('financeBudgetItem', id);
      itemCache.set(id, entry);
    }
    return entry;
  };
  const assignmentFor = async (itemId: string | undefined): Promise<BudgetHistoryAssignment> => {
    if (!itemId) return { kind: 'unbudgeted' };
    const item = await readItem(itemId);
    return typeof item?.budgetId === 'string'
      ? { kind: 'budget', budgetId: item.budgetId }
      : { kind: 'unresolved' };
  };
  for (const page of scanned) {
    complete &&= page.complete;
    for (const source of await inBatches(page.ids, async (id) => {
      if (!(await guard.readCanonicalSource('financeTransaction', id))) return undefined;
      return loadCanonicalFinanceFact(id);
    })) {
      if (!source || source.transaction.accountId !== page.accountId) {
        complete = false;
        continue;
      }
      for (const [scope, revision] of Object.entries(source.dependencies)) {
        if (checkedDependencies.has(scope) && checkedDependencies.get(scope) !== revision)
          throw unavailable();
        checkedDependencies.set(scope, revision);
      }
      const { transaction, fact, isLinkedRefund } = source;
      const date = localFinanceDate(transaction.effectiveAt, request.timeZone);
      if (date > ends.at(-1)!) continue;
      const prior = observedFrom.get(page.accountId);
      if (!prior || date < prior) observedFrom.set(page.accountId, date);
      if (date < dates[0]! || !isPostedSpendSource(transaction)) continue;
      for (const [index, slice] of fact.slices.entries()) {
        if (
          slice.originalExpenseTransactionId &&
          !(await guard.readCanonicalSource(
            'financeTransaction',
            slice.originalExpenseTransactionId,
          ))
        ) {
          complete = false;
          continue;
        }
        const assignment = await assignmentFor(slice.budgetItemId);
        if (
          slice.budgetId &&
          (assignment.kind !== 'budget' || assignment.budgetId !== slice.budgetId)
        ) {
          complete = false;
          continue;
        }
        addActivity(index, 'expense', slice.amountMinor, slice.budgetItemId, assignment);
      }
      if (transaction.amountMinor > 0 && !isLinkedRefund) {
        if (
          transaction.allocations.some(({ amountMinor }) => amountMinor <= 0) ||
          addMinorUnits(transaction.allocations.map(({ amountMinor }) => amountMinor)) >
            transaction.amountMinor
        )
          throw unavailable();
        for (const [index, allocation] of transaction.allocations.entries()) {
          if (allocation.amountMinor <= 0) continue;
          addActivity(
            index,
            'income',
            allocation.amountMinor,
            allocation.budgetItemId,
            await assignmentFor(allocation.budgetItemId),
          );
        }
      }
      function addActivity(
        index: number,
        kind: ForecastActivity['kind'],
        amountMinor: number,
        itemId: string | undefined,
        assignment: BudgetHistoryAssignment,
      ) {
        if (assignment.kind === 'unresolved') complete = false;
        if (assignment.kind === 'budget' && assignment.budgetId === budgetId) {
          observedAccounts.add(page.accountId);
          if (itemId && date <= asOfDate)
            usedByItem.set(
              itemId,
              addMinorUnits([
                usedByItem.get(itemId) ?? 0,
                kind === 'expense' ? -amountMinor : amountMinor,
              ]),
            );
        }
        candidates.push({
          accountId: page.accountId,
          assignment,
          value: {
            id: JSON.stringify([transaction.id, kind, index]),
            date,
            kind,
            currency: transaction.currency,
            amountMinor,
          },
        });
      }
    }
  }
  const shared = {
    window,
    asOfDate,
    candidates,
    actualsComplete: complete,
    scope: {
      budgetId,
      authorizedBudgetIds: new Set([budgetId]),
      authorizedAccountIds: authorized,
      linkedAccountIds: linked,
      includeNonBudgetedHistory: request.includeNonBudgetedHistory,
    },
  };
  let result;
  if (request.method === 'historical') {
    // An exhausted canonical index verifies stored records. Avoid treating months before
    // the first source observation as zero-history months.
    const coveredHistoryMonths =
      complete && observedAccounts.size
        ? history!.months.filter((month) =>
            [...observedAccounts].every(
              (id) => (observedFrom.get(id) ?? '9999-12-31') <= month + '-01',
            ),
          )
        : [];
    result = calculateBudgetForecast({ ...shared, method: 'historical', coveredHistoryMonths });
  } else {
    const ids = await budgetRows(budget.groupId, 'budgetItems', budgetId);
    const items = (await inBatches(ids, readItem)) as (BudgetItem | undefined)[];
    const upcoming = await upcomingPlans(guard, scopes, budgetId, asOfDate);
    const upcomingIds = new Set(upcoming.rows.map(({ id }) => id));
    const plans = (complete && upcoming.complete ? items : []).flatMap(
      (item): ForecastObligation[] => {
        if (item?.budgetId !== budgetId || item.status !== 'active' || !item.plannedAmountMinor)
          return [];
        const sign = Math.sign(item.plannedAmountMinor);
        return [
          {
            id:
              !upcomingIds.has('budgetItem:' + item.id) &&
              item.sourceReusableItemId &&
              item.applicableDate
                ? plannedSourceIdentity({
                    type: 'reusableOccurrence',
                    reusableItemId: item.sourceReusableItemId,
                    occurrenceDate: item.applicableDate,
                  })
                : 'budgetItem:' + item.id,
            source: 'plan',
            dueDate: item.applicableDate ?? budget.startDate,
            kind: sign < 0 ? 'expense' : 'income',
            currency: item.currency,
            remainingMinor: Math.max(
              0,
              addMinorUnits([
                Math.abs(item.plannedAmountMinor),
                -Math.max(0, sign * (usedByItem.get(item.id) ?? 0)),
              ]),
            ),
          },
        ];
      },
    );
    result = calculateBudgetForecast({
      ...shared,
      method: 'known-plan',
      obligations: upcoming.complete ? [...plans, ...upcoming.rows] : [],
      obligationsComplete: upcoming.complete && items.every(Boolean) && complete,
    });
  }

  const [currentCoverage, currentScopes, dependencyVersions, currentAccountKeys] =
    await Promise.all([
      readFinanceForecastAccountCoverage(userId, [...authorized]),
      Promise.all(scopes.map(scopeMeta)),
      inBatches([...checkedDependencies.keys()], scopeMeta),
      listFinanceBrowseKeys(userId, 'accounts'),
    ]);
  if (
    JSON.stringify(currentCoverage) !== JSON.stringify(coverage) ||
    JSON.stringify([...new Set(currentAccountKeys)].sort()) !== JSON.stringify(accountKeys) ||
    currentScopes.some((revision, index) => revision !== scopeRevisions[index]) ||
    [...checkedDependencies.values()].some(
      (version, index) => version !== dependencyVersions[index],
    )
  )
    throw unavailable();
  await guard.assertCurrent();
  const sourceRevision = createHash('sha256')
    .update(
      JSON.stringify([
        userId,
        budgetId,
        budget.version,
        securityRevision,
        request,
        window,
        asOfDate,
        coverage,
        currentScopes,
        [...checkedDependencies],
        result,
      ]),
    )
    .digest('hex');
  return financeForecastResultSchema.parse({
    ...result,
    budgetId,
    timeZone: request.timeZone,
    sourceAsOf: now,
    sourceRevision,
  });
}
