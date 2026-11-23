import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createBalancedAllocations,
  createFinancialTransaction,
  type BudgetItem,
} from '@naaseh/domain';
import * as canonical from '../../apps/api/src/finance/canonical-spend-source.js';
import * as dashboard from '../../apps/api/src/finance/dashboard-service.js';
import { readFinanceBudgetForecast } from '../../apps/api/src/finance/forecast-service.js';
import * as runtime from '../../apps/api/src/finance/query-runtime.js';
import { financeReadKeys } from '../../apps/api/src/finance/read-repository.js';
import { createFinanceFact } from '../../apps/api/src/finance/spend-projection-service.js';
import { FinanceSyncSourceGuard } from '../../apps/api/src/finance/sync-source-guard.js';
import { dynamodb } from '../../apps/api/src/shared/dynamodb.js';
import { experienceId } from '../fixtures/finance/experience.js';

const budget = experienceId(1);
const account = experienceId(2);
const item = experienceId(3);
const link = experienceId(4);
const group = experienceId(5);
const now = '2026-11-22T12:00:00.000Z';
const input = { userId: 'owner', budgetId: budget, now, securityRevision: 5 };

function setup() {
  const expenseDate = '2026-11-12T12:00:00.000Z';
  const transaction = createFinancialTransaction({
    id: experienceId(6),
    accountId: account,
    description: 'Posted payment',
    amountMinor: -1200,
    currency: 'USD',
    origin: 'manual',
    postedAt: expenseDate,
    pending: false,
    connectedAccount: false,
  });
  transaction.allocations = createBalancedAllocations(
    -1200,
    [
      {
        id: experienceId(7),
        financeCategoryId: experienceId(8),
        budgetItemId: item,
        amountMinor: -1200,
      },
    ],
    'owner',
    new Date(expenseDate),
  );
  const plan = {
    id: item,
    budgetId: budget,
    plannedAmountMinor: -5000,
    currency: 'USD',
    currencyExponent: 2,
    applicableDate: '2026-11-30',
    status: 'active',
  };
  const sources = new Map<string, Record<string, unknown>>([
    [
      budget,
      { id: budget, groupId: group, startDate: '2026-11-01', endDate: '2026-11-30', version: 3 },
    ],
    [account, { id: account }],
    [item, plan],
    [link, { accountId: account, budgetId: budget }],
    [transaction.id, { id: transaction.id }],
  ]);
  vi.spyOn(FinanceSyncSourceGuard.prototype, 'readCanonicalSource').mockImplementation(
    async (_, id) => sources.get(id),
  );
  vi.spyOn(FinanceSyncSourceGuard.prototype, 'assertCurrent').mockResolvedValue(undefined);
  vi.spyOn(runtime, 'listFinanceBrowseKeys').mockResolvedValue([account]);
  const coverage = vi
    .spyOn(runtime, 'readFinanceForecastAccountCoverage')
    .mockResolvedValue({ viewerRevision: 'member-5', revisions: [[account, 'current']] });
  vi.spyOn(dashboard, 'budgetRows').mockImplementation(async (_, name) =>
    name === 'budgetItems' ? [item] : [link],
  );
  const load = vi.spyOn(canonical, 'loadCanonicalFinanceFact').mockResolvedValue({
    fact: createFinanceFact(transaction, { budgetItems: [plan as BudgetItem] }),
    transaction,
    isLinkedRefund: false,
    dependencies: {},
    sourceKey: { PK: 'scope', SK: 'transaction' },
  });
  const reads: QueryCommand[] = [];
  let truncated = false;
  vi.spyOn(dynamodb, 'send').mockImplementation((async (command: GetCommand | QueryCommand) => {
    if (command instanceof GetCommand) return { Item: { revision: 1 } };
    const PK = command.input.ExpressionAttributeValues?.[':pk'];
    if (PK !== financeReadKeys.account(account)) return { Items: [] };
    reads.push(command);
    const SK = financeReadKeys.date(transaction);
    return {
      Items: [{ PK, SK, transactionId: transaction.id }],
      ...(truncated ? { LastEvaluatedKey: { PK, SK } } : {}),
    };
  }) as typeof dynamodb.send);
  return {
    coverage,
    reads,
    load,
    truncate: () => {
      truncated = true;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

it('reads bounded account/date references and subtracts posted allocations from known plans', async () => {
  const { reads, load } = setup();
  const result = await readFinanceBudgetForecast({ ...input, request: { method: 'known-plan' } });
  expect(result).toMatchObject({
    coverage: 'complete',
    currencies: [
      {
        actual: { expenseMinor: 1200, incomeMinor: 0 },
        remaining: { expenseMinor: 3800, incomeMinor: 0 },
        projected: { expenseMinor: 5000, incomeMinor: 0 },
      },
    ],
  });
  expect(reads).toHaveLength(1);
  expect(reads[0]!.input).toMatchObject({
    ProjectionExpression: 'PK, SK, transactionId',
    Limit: 100,
    ConsistentRead: true,
    ExpressionAttributeValues: {
      ':first': 'DATE#2026-10-31',
      ':last': 'DATE#2026-11-23\uffff',
    },
  });
  expect(load).toHaveBeenCalledOnce();
});

it('reports truncated history as insufficient and binds the revision to the request and visit', async () => {
  const { truncate } = setup();
  truncate();
  const first = await readFinanceBudgetForecast({ ...input, request: { method: 'historical' } });
  expect(first).toMatchObject({
    coverage: 'partial',
    status: 'insufficient-history',
    observed: { coveredMonths: 0 },
    currencies: [{ actual: { expenseMinor: 1200 }, remaining: null, projected: null }],
  });
  for (const changed of [
    { ...input, request: { method: 'historical', includeNonBudgetedHistory: true } },
    { ...input, request: { method: 'historical', dateFrom: '2026-11-02', dateTo: '2026-11-30' } },
    { ...input, securityRevision: 6, request: { method: 'historical' } },
  ]) {
    const result = await readFinanceBudgetForecast(changed);
    expect(result.sourceRevision).not.toBe(first.sourceRevision);
    expect(result.currencies[0]?.actual).toEqual(first.currencies[0]?.actual);
  }
});

it('rejects a change to source coverage during the read', async () => {
  const { coverage } = setup();
  coverage.mockResolvedValueOnce({ viewerRevision: 'member-5', revisions: [[account, 'prior']] });
  await expect(
    readFinanceBudgetForecast({ ...input, request: { method: 'known-plan' } }),
  ).rejects.toMatchObject({ status: 409 });
});
