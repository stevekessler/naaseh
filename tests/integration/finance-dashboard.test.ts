import {
  closeBudget,
  createBudget,
  createExpenseRefundRelationship,
  createUpcomingExpense,
  deactivateBudget,
  selectDashboardUpcoming,
  type UpcomingExpensePlannedSource,
} from '@naaseh/domain';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { financeDashboardPreferencesResponseSchema } from '@naaseh/contracts';
import { describe, expect, it, vi } from 'vitest';
import { FinanceDashboardPreferenceService } from '../../apps/api/src/finance/dashboard-preference-service.js';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import { createFinanceFact } from '../../apps/api/src/finance/spend-projection-service.js';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';

const now = new Date('2026-11-15T18:00:00.000Z');
const target = { targetKind: 'account', targetId: experienceId(1) } as const;

function fixture() {
  const { actors } = buildExperienceFixture();
  const owner = actors.owner;
  const other = { ...owner, id: 'different-dashboard-owner', role: 'admin' as const };
  const allowed = new Set([target.targetId]);
  const rows = new Map<string, Record<string, unknown>>();
  const fence = {
    ConditionCheck: {
      TableName: 'finance-table',
      Key: { PK: `FINANCE#ACCOUNT#${target.targetId}`, SK: 'CURRENT' },
      ConditionExpression: '#version = :expected',
      ExpressionAttributeNames: { '#version': 'version' },
      ExpressionAttributeValues: { ':expected': 4 },
    },
  };
  let sourceVersion = 4;
  const send = vi.fn(async (command: GetCommand | QueryCommand | TransactWriteCommand) => {
    if (command instanceof QueryCommand) {
      const pk = command.input.ExpressionAttributeValues?.[':pk'];
      const prefix = String(command.input.ExpressionAttributeValues?.[':prefix']);
      return {
        Items: [...rows.values()].filter(
          (row) => row.PK === pk && String(row.SK).startsWith(prefix),
        ),
      };
    }
    if (command instanceof GetCommand) {
      const key = command.input.Key;
      return { Item: rows.get(`${key?.PK}|${key?.SK}`) };
    }
    for (const item of command.input.TransactItems ?? []) {
      if (
        item.ConditionCheck &&
        sourceVersion !== item.ConditionCheck.ExpressionAttributeValues?.[':expected']
      )
        throw new Error('source changed');
      const put = item.Put;
      if (!put) continue;
      const key = `${put.Item?.PK}|${put.Item?.SK}`;
      const expected = put.ExpressionAttributeValues?.[':expected'];
      if (expected === undefined ? rows.has(key) : rows.get(key)?.version !== expected)
        throw new Error('preference version conflict');
      rows.set(key, put.Item!);
    }
    return {};
  });
  const service = new FinanceDashboardPreferenceService({
    client: { send: send as never },
    tableName: 'finance-table',
    now: () => now,
    authorizeTarget: async (_actor, value) => (allowed.has(value.targetId) ? [fence] : undefined),
  });
  return {
    service,
    owner,
    other,
    allowed,
    send,
    revokeAtCommit: () => {
      sourceVersion++;
    },
  };
}

describe('Finance dashboard preferences', () => {
  it('defaults to no flags and ten upcoming rows without writing defaults', async () => {
    const { service, owner, send } = fixture();
    const response = await service.read(owner);
    expect(financeDashboardPreferencesResponseSchema.parse(response)).toEqual({
      flags: [],
      settings: { upcomingCount: 10, version: 0 },
    });
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(['QueryCommand']);
  });

  it('keeps flags and count in the caller partition, including for administrators', async () => {
    const { service, owner, other } = fixture();
    await service.setFlag(owner, target, { included: true });
    await service.setUpcomingCount(owner, { upcomingCount: 15, expectedVersion: 0 });
    await service.setFlag(other, target, { included: false });
    expect(await service.read(owner)).toEqual({
      flags: [{ ...target, included: true, version: 1 }],
      settings: { upcomingCount: 15, version: 1 },
    });
    expect(await service.read(other)).toEqual({
      flags: [{ ...target, included: false, version: 1 }],
      settings: { upcomingCount: 10, version: 0 },
    });
  });

  it('rejects competing revisions and allows a checked update', async () => {
    const { service, owner } = fixture();
    await service.setFlag(owner, target, { included: true });
    await expect(service.setFlag(owner, target, { included: false })).rejects.toThrow(
      'preference version conflict',
    );
    await expect(
      service.setFlag(owner, target, { included: false, expectedVersion: 1 }),
    ).resolves.toEqual({ ...target, included: false, version: 2 });
    await service.setUpcomingCount(owner, { upcomingCount: 5, expectedVersion: 0 });
    await expect(
      service.setUpcomingCount(owner, { upcomingCount: 20, expectedVersion: 0 }),
    ).rejects.toThrow('preference version conflict');
  });

  it('hides dormant flags on revocation and restores them when access returns', async () => {
    const { service, owner, allowed } = fixture();
    await service.setFlag(owner, target, { included: true });
    allowed.clear();
    expect((await service.read(owner)).flags).toEqual([]);
    await expect(
      service.setFlag(owner, target, { included: false, expectedVersion: 1 }),
    ).rejects.toThrow('Finance record not found.');
    allowed.add(target.targetId);
    expect((await service.read(owner)).flags).toEqual([{ ...target, included: true, version: 1 }]);
  });

  it('binds the preference write to the current target source and leaves the flag absent on conflict', async () => {
    const { service, owner, revokeAtCommit } = fixture();
    revokeAtCommit();
    await expect(service.setFlag(owner, target, { included: true })).rejects.toThrow(
      'source changed',
    );
    expect((await service.read(owner)).flags).toEqual([]);
  });

  it('rejects cross-owner inputs, unsupported counts, and inactive actors before writing', async () => {
    const { service, owner, send } = fixture();
    await expect(
      service.setFlag(owner, target, { included: true, ownerId: 'another-user' }),
    ).rejects.toThrow();
    await expect(
      service.setUpcomingCount(owner, { upcomingCount: 11, expectedVersion: 0 }),
    ).rejects.toThrow();
    await expect(service.read({ ...owner, active: false })).rejects.toThrow(
      'Finance record not found.',
    );
    expect(send).not.toHaveBeenCalled();
  });
});

it('deduplicates explicit obligations and never counts overdue, paid or cancelled expenses toward the upcoming limit', () => {
  const source = { type: 'budgetItem', budgetItemId: experienceId(500) } as const;
  const make = (
    id: number,
    state: 'upcoming' | 'overdue' | 'paid' | 'cancelled' = 'upcoming',
    version = 1,
    plannedSource?: UpcomingExpensePlannedSource,
  ) => ({
    state,
    expense: {
      id: experienceId(id),
      dueDate: '2027-01-01',
      version,
      description: 'Same description',
      ...(plannedSource ? { plannedSource } : {}),
    },
  });
  const latest = make(2, 'upcoming', 2, source);
  const overdue = make(3, 'overdue');
  const distinct = Array.from({ length: 20 }, (_, i) => make(10 + i));
  const available = [
    make(1, 'upcoming', 1, source),
    latest,
    overdue,
    make(4),
    make(4, 'paid', 2),
    make(5, 'cancelled'),
    ...distinct,
  ].reverse();
  for (const limit of [5, 10, 15, 20] as const) {
    expect(selectDashboardUpcoming(available, limit)).toEqual({
      overdue: [overdue],
      upcoming: [latest, ...distinct].slice(0, limit),
    });
  }
});

it('creates a protected local-calendar trend query and leaves source authorization to the query runtime', async () => {
  const { startSpendTrendPeriod } = await import('../../apps/api/src/finance/dashboard-service.js');
  const start = vi.fn(async () => experienceId(20));
  const request = {
    mode: 'quarter',
    period: 7,
    timeZone: 'America/Denver',
    accountIds: [experienceId(1)],
  };
  const instant = '2026-01-01T02:00:00.000Z';
  await expect(
    startSpendTrendPeriod({ start }, 'owner', 4, request, 'retry', instant),
  ).resolves.toMatchObject({ dateFrom: '2025-10-01', dateTo: '2025-12-31' });
  expect(start).toHaveBeenCalledWith(
    'owner',
    4,
    {
      accountIds: request.accountIds,
      filters: {
        postedSpendOnly: true,
        dateFrom: '2025-10-01',
        dateTo: '2025-12-31',
        timeZone: request.timeZone,
      },
    },
    'retry',
  );
  await expect(
    startSpendTrendPeriod({ start }, 'owner', 4, { ...request, period: 9 }, 'invalid', instant),
  ).rejects.toThrow('valid period');
  expect(start).toHaveBeenCalledTimes(1);
});

it('reports zero-plan and overspent budgets with independent currency totals', async () => {
  const { summarizeDashboardBudget } = await import('@naaseh/domain');
  expect(
    summarizeDashboardBudget(
      [
        { currency: 'USD', currencyExponent: 2, plannedAmountMinor: -1000 },
        { currency: 'EUR', currencyExponent: 2, plannedAmountMinor: 0 },
      ],
      [
        { currency: 'USD', currencyExponent: 2, amountMinor: 1200 },
        { currency: 'EUR', currencyExponent: 2, amountMinor: -100 },
      ],
    ),
  ).toEqual([
    {
      currency: 'EUR',
      currencyExponent: 2,
      plannedMinor: 0,
      spentMinor: -100,
      remainingMinor: 100,
      percentUsed: null,
    },
    {
      currency: 'USD',
      currencyExponent: 2,
      plannedMinor: 1000,
      spentMinor: 1200,
      remainingMinor: -200,
      percentUsed: 120,
    },
  ]);
});

it('keeps hidden budget amounts and linked accounts out of the dashboard projection', async () => {
  const [{ readDashboardBudget }, { FinanceSyncSourceGuard }, { dynamodb }] = await Promise.all([
    import('../../apps/api/src/finance/dashboard-service.js'),
    import('../../apps/api/src/finance/sync-source-guard.js'),
    import('../../apps/api/src/shared/dynamodb.js'),
  ]);
  const [
    budgetId,
    groupId,
    visibleAccount,
    hiddenAccount,
    firstLink,
    secondLink,
    firstItem,
    secondItem,
  ] = Array.from({ length: 8 }, (_, index) => experienceId(300 + index)) as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  const budget = createBudget({
    id: budgetId,
    groupId,
    name: 'Shared budget',
    budgetDate: '2026-11-01',
    startDate: '2026-11-01',
    status: 'active',
  });
  expect(budget.activity).toBe('active');
  const sources = new Map<string, Record<string, unknown>>([
    [budgetId, budget],
    [firstLink, { budgetId, status: 'active', accountId: visibleAccount }],
    [
      firstItem,
      {
        budgetId,
        status: 'active',
        relatedAccountIds: [visibleAccount],
        currency: 'USD',
        currencyExponent: 2,
        plannedAmountMinor: -1200,
      },
    ],
    [
      secondItem,
      {
        budgetId,
        status: 'active',
        relatedAccountIds: [hiddenAccount],
        currency: 'USD',
        currencyExponent: 2,
        plannedAmountMinor: -987654,
      },
    ],
  ]);
  const source = vi
    .spyOn(FinanceSyncSourceGuard.prototype, 'readCanonicalSource')
    .mockImplementation(async (_, id) => sources.get(id));
  const assertCurrent = vi
    .spyOn(FinanceSyncSourceGuard.prototype, 'assertCurrent')
    .mockResolvedValue(undefined);
  const send = vi.spyOn(dynamodb, 'send').mockImplementation((async (command: QueryCommand) => ({
    Items: (String(command.input.ExpressionAttributeValues?.[':prefix']).includes('budgetItems')
      ? [firstItem, secondItem]
      : [firstLink, secondLink]
    ).map((entryKey) => ({ entryKey })),
  })) as never);
  try {
    const result = await readDashboardBudget('owner', budgetId);
    expect(result).toMatchObject({
      accountIds: [visibleAccount],
      complete: false,
      items: [{ id: firstItem, plannedAmountMinor: -1200 }],
    });
    expect(JSON.stringify(result)).not.toContain(hiddenAccount);
    expect(JSON.stringify(result)).not.toContain('987654');
    expect(assertCurrent).toHaveBeenCalledTimes(1);
    for (const excluded of [
      deactivateBudget(budget, 'owner', now),
      closeBudget(budget, 'owner', now),
      { ...budget, status: 'archived' },
    ]) {
      sources.set(budgetId, excluded);
      await expect(readDashboardBudget('owner', budgetId)).resolves.toBeNull();
    }
    expect(send).toHaveBeenCalledTimes(2);
  } finally {
    source.mockRestore();
    assertCurrent.mockRestore();
    send.mockRestore();
  }
});

it('includes a linked refund once across multiple watched categories and keeps its signed spend', async () => {
  const { actors, budgetItems, categories, transactions, refunds } = buildExperienceFixture();
  const original = transactions[0]!;
  const credit = transactions[2]!;
  const ordinaryCredit = transactions[3]!;
  const { id, linkedAmountMinor, allocations } = refunds[1]!;
  const refund = createExpenseRefundRelationship({
    id,
    original,
    refund: credit,
    linkedAmountMinor,
    refundedAllocations: allocations,
    confirmedPartialAllocations: true,
    existing: [],
    budgetItems,
    actorId: actors.owner.id,
    now,
  });
  const facts = [
    createFinanceFact(original, { budgetItems }),
    createFinanceFact(credit, { original, refund }),
    createFinanceFact(ordinaryCredit, {}),
  ];
  const [parent, child] = categories;
  const repo = new FinanceReadRepository({
    client: { send: async () => ({ Items: facts.map((fact) => ({ fact })) }) },
    tableName: 'finance-table',
    cursorSecret: 'x'.repeat(32),
    authorize: async () => true,
    loadDashboardCategories: async (rows) => {
      for (const row of rows) {
        row.dashboardCategoryIds = row.slices.flatMap(({ categoryId }) =>
          categoryId === child!.id ? [parent!.id, child!.id] : categoryId ? [categoryId] : [],
        );
      }
    },
  });
  const result = await repo.scanForJob({
    userId: actors.owner.id,
    accountId: credit.accountId,
    securityRevision: 1,
    sourceRevision: 'fixture',
    filters: { dashboardCategoryIds: [parent!.id, child!.id] },
    limit: 10,
  });
  expect(result.topRows.map((row) => row.id)).toEqual([credit.id, original.id]);
  expect(result.matchedCount).toBe(2);
  expect(result.totalsByCurrency).toEqual([
    { currency: 'USD', currencyExponent: 2, amountMinor: 8500 },
  ]);
});

it('classifies upcoming expenses on the dashboard in the viewer’s calendar', async () => {
  const { readDashboardUpcoming } = await import('../../apps/api/src/finance/dashboard-service.js');
  const runtime = await import('../../apps/api/src/finance/query-runtime.js');
  const { FinanceSyncSourceGuard } = await import(
    '../../apps/api/src/finance/sync-source-guard.js'
  );
  const expense = createUpcomingExpense({
    id: experienceId(900),
    accountId: experienceId(100),
    budgetId: experienceId(200),
    groupId: experienceId(1),
    description: 'Calendar boundary',
    dueDate: '2026-11-22',
    expectedAmountMinor: 2000,
    currency: 'USD',
    creatorId: 'owner',
    entryContext: {
      enteredAt: '2026-11-20T18:00:00.000Z',
      localDate: '2026-11-20',
      timeZone: 'America/Denver',
    },
  });
  const keys = vi
    .spyOn(runtime, 'listFinanceBrowseKeys')
    .mockImplementation(async (_, collection) =>
      collection === 'upcomingExpenses' ? [expense.id] : [],
    );
  const guard = new FinanceSyncSourceGuard({ userId: 'owner', role: 'user' });
  vi.spyOn(guard, 'readCanonicalSource').mockResolvedValue(expense);
  try {
    const instant = '2026-11-23T02:30:00.000Z';
    await expect(
      readDashboardUpcoming('owner', guard, 'America/Denver', instant),
    ).resolves.toMatchObject([{ state: 'due-today', expense: { dueDate: '2026-11-22' } }]);
    await expect(readDashboardUpcoming('owner', guard, 'UTC', instant)).resolves.toMatchObject([
      { state: 'overdue', expense: { dueDate: '2026-11-22' } },
    ]);
  } finally {
    keys.mockRestore();
  }
});
