import { describe, expect, it, vi } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import { contributionDelta } from '../../apps/api/src/finance/spend-projection-service.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

const fact = {
  id: 't1',
  accountId: 'a1',
  effectiveAt: '2026-10-01T12:00:00Z',
  currency: 'USD',
  currencyExponent: 2,
  amountMinor: -100,
  description: 'Synthetic expense',
  sourceVersion: 1,
  slices: [],
};
const request = {
  userId: 'u1',
  accountId: 'a1',
  sourceRevision: 'r1',
  securityRevision: 1,
  filters: {},
  limit: 50,
};
function summaryRow(value: FinanceFact, amountMinor = 100) {
  return {
    PK: `FINANCE#FACT_ACCOUNT#${value.accountId}`,
    SK: `DATE#${value.effectiveAt}#${value.id}`,
    transactionId: value.id,
    aggregate: {
      version: 1,
      id: value.id,
      accountId: value.accountId,
      effectiveAt: value.effectiveAt,
      sourceVersion: value.sourceVersion,
      active: !value.sourceStatus || value.sourceStatus === 'active',
      hasSpend: true,
      totals: [{ currency: 'USD', currencyExponent: 2, amountMinor }],
      originalSourceAccountIds: ['original'],
      budgetIds: ['budget'],
    },
  };
}
function setup(responses: object[]) {
  const send = vi.fn();
  responses.forEach((r) => send.mockResolvedValueOnce(r));
  const authorize = vi.fn(async () => true);
  const repository = new FinanceReadRepository({
    client: { send },
    tableName: 'table',
    cursorSecret: 'x'.repeat(32),
    authorize,
  });
  return { repository, send, authorize };
}

describe('bounded source-authorized Finance indexed reads', () => {
  it('computes broad job aggregates from compact references without hydrating full facts', async () => {
    const credit = { ...fact, id: 'refund' };
    const inactive = { ...fact, id: 'archived', sourceStatus: 'archived' as const };
    const noSpend = summaryRow({ ...fact, id: 'pending' }, 0);
    noSpend.aggregate.hasSpend = false;
    noSpend.aggregate.totals = [];
    const { repository, send, authorize } = setup([
      {
        Items: [summaryRow(fact, 100), summaryRow(credit, -30), summaryRow(inactive), noSpend],
        ScannedCount: 4,
      },
    ]);
    const result = await repository.scanForJob(request);
    expect(result).toMatchObject({
      matchedCount: 3,
      examined: 4,
      totalsByCurrency: [{ currency: 'USD', amountMinor: 70 }],
    });
    expect(result.topRows.map((row) => row.id).sort()).toEqual(['pending', 'refund', 't1']);
    expect(send).toHaveBeenCalledTimes(1);
    expect(authorize).toHaveBeenLastCalledWith(expect.anything(), ['original'], ['budget']);
    expect(result).not.toHaveProperty('page');
    expect(JSON.stringify(result)).not.toContain('Synthetic expense');
  });

  it('mixes legacy fact loading with compact references and preserves posted-only and boundary semantics', async () => {
    const legacy = { ...fact, id: 'old' };
    const current = summaryRow(fact, -25);
    const noSpend = summaryRow({ ...fact, id: 'pending' });
    noSpend.aggregate.hasSpend = false;
    noSpend.aggregate.totals = [];
    const { repository, send } = setup([
      {
        Items: [
          current,
          noSpend,
          { PK: current.PK, SK: `DATE#${legacy.effectiveAt}#old`, transactionId: 'old' },
        ],
      },
      { Responses: { table: [{ fact: legacy }] } },
    ]);
    const result = await repository.scanForJob({ ...request, filters: { postedSpendOnly: true } });
    expect(result).toMatchObject({ matchedCount: 1, totalsByCurrency: [{ amountMinor: -25 }] });
    expect(send.mock.calls[1]![0].input.RequestItems.table.Keys).toEqual([
      { PK: 'FINANCE#FACT#old', SK: 'CURRENT' },
    ]);
    const boundary = setup([{ Items: [summaryRow(fact)] }]);
    expect(
      (
        await boundary.repository.scanForJob({
          ...request,
          before: { id: fact.id, effectiveAt: '2026-10-01T12:00:00.000Z' },
        })
      ).matchedCount,
    ).toBe(0);
  });

  it('uses compact trend inputs and enforces local boundaries within the widened UTC read', async () => {
    const before = { ...fact, id: 'before', effectiveAt: '2026-10-01T06:59:59Z' };
    const inside = { ...fact, id: 'inside', effectiveAt: '2026-10-01T07:00:00Z' };
    const after = { ...fact, id: 'after', effectiveAt: '2026-11-01T07:00:00Z' };
    const { repository, send } = setup([
      { Items: [summaryRow(before, 400), summaryRow(inside, -30), summaryRow(after, 200)] },
    ]);
    await expect(
      repository.scanForJob({
        ...request,
        filters: {
          dateFrom: '2026-10-01',
          dateTo: '2026-10-31',
          timeZone: 'America/Los_Angeles',
          postedSpendOnly: true,
        },
      }),
    ).resolves.toMatchObject({ matchedCount: 1, totalsByCurrency: [{ amountMinor: -30 }] });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('matches watched category activity for pending rows without treating it as posted spend', async () => {
    const categoryId = '01K00000000000000000000001';
    const pending = { ...fact, id: 'pending', pending: true };
    const outside = { ...fact, id: 'outside' };
    const send = vi.fn().mockResolvedValue({ Items: [{ fact: pending }, { fact: outside }] });
    const loadDashboardCategories = vi.fn(async (facts: FinanceFact[]) => {
      facts.find(({ id }) => id === pending.id)!.dashboardCategoryIds = [categoryId];
    });
    const repository = new FinanceReadRepository({
      client: { send },
      tableName: 'table',
      cursorSecret: 'x'.repeat(32),
      authorize: async () => true,
      loadDashboardCategories,
    });
    await expect(
      repository.scanForJob({ ...request, filters: { dashboardCategoryIds: [categoryId] } }),
    ).resolves.toMatchObject({
      matchedCount: 1,
      topRows: [{ id: 'pending' }],
      totalsByCurrency: [],
    });
    expect(loadDashboardCategories).toHaveBeenCalledOnce();
  });

  it('hydrates real facts for public rows and filters unsupported by compact aggregates', async () => {
    for (const filters of [
      {},
      { amountMin: -200 },
      { currency: 'USD' },
      { budgetIds: ['01K00000000000000000000001'] },
    ]) {
      const row = summaryRow(fact);
      const f = setup([{ Items: [row] }, { Responses: { table: [{ fact }] } }]);
      if (Object.keys(filters).length) await f.repository.scanForJob({ ...request, filters });
      else expect((await f.repository.read(request)).items).toEqual([fact]);
      expect(f.send).toHaveBeenCalledTimes(2);
    }
  });

  it('rejects malformed or misplaced compact state and rechecks dependent access before publishing totals', async () => {
    for (const mutation of [
      (row: ReturnType<typeof summaryRow>) => {
        row.aggregate.id = 'other';
      },
      (row: ReturnType<typeof summaryRow>) => {
        row.aggregate.accountId = 'other';
      },
      (row: ReturnType<typeof summaryRow>) => {
        row.aggregate.totals[0]!.amountMinor = Number.MAX_SAFE_INTEGER + 1;
      },
      (row: ReturnType<typeof summaryRow>) => {
        row.SK = 'DATE#wrong';
      },
    ]) {
      const row = summaryRow(fact);
      mutation(row);
      await expect(setup([{ Items: [row] }]).repository.scanForJob(request)).rejects.toThrow(
        /aggregate|invariant|summary|projection/i,
      );
    }
    const f = setup([{ Items: [summaryRow(fact)] }]);
    f.authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(f.repository.scanForJob(request)).rejects.toThrow(/authoriz/i);
  });
  it('binds a continuation boundary to the cursor and excludes equal/newer rows from bounded scans', async () => {
    const same = { ...fact, id: 't2', effectiveAt: '2026-10-02T12:00:00Z' };
    const newer = { ...fact, id: 't3', effectiveAt: '2026-10-03T12:00:00Z' };
    const sameInstantHigherId = { ...same, id: 't9', effectiveAt: '2026-10-02T12:00:00.000Z' };
    const { repository, send } = setup([
      {
        Items: [newer, same, sameInstantHigherId, fact].map((value) => ({
          PK: 'FINANCE#FACT_ACCOUNT#a1',
          SK: `DATE#${value.effectiveAt}#${value.id}`,
          fact: value,
        })),
        ScannedCount: 4,
        LastEvaluatedKey: {
          PK: 'FINANCE#FACT_ACCOUNT#a1',
          SK: `DATE#${fact.effectiveAt}#${fact.id}`,
        },
      },
    ]);
    const before = { id: same.id, effectiveAt: same.effectiveAt };
    const result = await repository.scan({ ...request, before });
    expect(result.page.items).toEqual([fact]);
    expect(result.step.matchedCount).toBe(1);
    expect(result.step.examined).toBe(4);
    expect(
      (send.mock.calls[0]![0] as QueryCommand).input.ExpressionAttributeValues?.[':last'],
    ).toBe('DATE#2026-10-02\uffff');
    await expect(
      repository.read({
        ...request,
        before: { ...before, id: 'different' },
        cursor: result.step.nextCursor,
      }),
    ).rejects.toThrow(/cursor|context/i);
  });

  it('uses a date index and a hard examined-row budget without scope hydration', async () => {
    const { repository, send } = setup([{ Items: [{ fact }], ScannedCount: 1 }]);
    const result = await repository.read(request);
    expect(result.items).toEqual([fact]);
    expect(result.rowsState).toBe('ready');
    const command = send.mock.calls[0]![0] as QueryCommand;
    expect(command).toBeInstanceOf(QueryCommand);
    expect(command.input).toMatchObject({
      Limit: 1_000,
      ConsistentRead: true,
      ScanIndexForward: false,
      ExpressionAttributeValues: { ':pk': 'FINANCE#FACT_ACCOUNT#a1' },
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('probes exact leading-zero check numbers without scanning all account facts', async () => {
    const { repository, send } = setup([{ Items: [], ScannedCount: 0 }]);
    const result = await repository.read({ ...request, filters: { checkNumber: ' 00123 ' } });
    const command = send.mock.calls[0]![0] as QueryCommand;
    expect(command.input.ExpressionAttributeValues?.[':pk']).toContain(
      'FINANCE#FACT_SEARCH#a1#check#00123',
    );
    expect(result.rowsState).toBe('confirmed-empty');
    expect(result.coverage.scopeComplete).toBe(true);
  });

  it('binds signed cursors to owner, account, filters, source and security revisions', async () => {
    const { repository } = setup([
      { Items: [{ fact }], ScannedCount: 1, LastEvaluatedKey: { PK: 'p', SK: 's' } },
    ]);
    const result = await repository.read(request);
    expect(result.nextCursor).toBeTruthy();
    for (const changed of [
      { userId: 'u2' },
      { accountId: 'a2' },
      { sourceRevision: 'r2' },
      { securityRevision: 2 },
      { filters: { text: 'other' } },
    ]) {
      await expect(
        repository.read({ ...request, ...changed, cursor: result.nextCursor }),
      ).rejects.toThrow(/cursor|context/i);
    }
    await expect(repository.read({ ...request, cursor: result.nextCursor + 'x' })).rejects.toThrow(
      /cursor/i,
    );
  });

  it('distinguishes an empty intermediate page and rechecks authorization before delivery', async () => {
    const { repository, authorize } = setup([
      { Items: [], ScannedCount: 1_000, LastEvaluatedKey: { PK: 'p', SK: 's' } },
      { Items: [{ fact }], ScannedCount: 1 },
    ]);
    const result = await repository.read(request);
    expect(result.rowsState).toBe('searching');
    expect(result.aggregateState).toBe('pending');
    expect(result.totalCount).toBeUndefined();
    authorize.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(repository.read(request)).rejects.toThrow(/access|authoriz/i);
  });

  it('reverses obsolete contributions and treats the same publication revision as a retry', () => {
    const previous = {
      transactionId: 't1',
      sourceVersion: 1,
      slices: [
        {
          transactionId: 't1',
          accountId: 'a1',
          effectiveAt: '2026-10-01T12:00:00Z',
          currency: 'USD',
          currencyExponent: 2,
          amountMinor: 100,
        },
      ],
    };
    expect(contributionDelta(previous, previous)).toEqual([]);
    const delta = contributionDelta(previous, {
      ...previous,
      sourceVersion: 2,
      slices: [{ ...previous.slices[0]!, amountMinor: 70 }],
    });
    expect(delta.map((s) => s.amountMinor)).toEqual([-100, 70]);
  });
});

it('uses a bounded account index range and returns only possible duplicate ordinals', async () => {
  const normalized = { ...fact, effectiveAt: '2026-10-01T12:00:00.000Z' };
  const send = vi.fn(async (command: unknown) => {
    expect(command).toBeInstanceOf(QueryCommand);
    return {
      Items: [
        {
          PK: 'FINANCE#FACT_ACCOUNT#a1',
          SK: `DATE#${normalized.effectiveAt}#t1`,
          transactionId: 't1',
          fact: normalized,
        },
      ],
    };
  });
  const reader = new FinanceReadRepository({
    tableName: 'fixture',
    cursorSecret: 'fixture-secret-'.repeat(4),
    client: { send },
    authorize: async () => true,
  });
  const row = {
    ordinal: 1,
    amountMinor: -100,
    transactedAt: normalized.effectiveAt,
    description: normalized.description,
  };
  expect(
    await reader.csvDuplicateOrdinals('a1', [row, { ...row, ordinal: 2, amountMinor: -101 }]),
  ).toEqual([1]);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    input: {
      Limit: 200,
      ConsistentRead: true,
      ExpressionAttributeValues: {
        ':pk': 'FINANCE#FACT_ACCOUNT#a1',
        ':start': `DATE#${normalized.effectiveAt}#`,
        ':end': `DATE#${normalized.effectiveAt}#\uffff`,
      },
    },
  });
});

it('withholds duplicate results when the bounded index read is incomplete', async () => {
  const send = vi.fn(async () => ({
    Items: [],
    LastEvaluatedKey: { PK: 'FINANCE#FACT_ACCOUNT#a1', SK: 'DATE#more' },
  }));
  const reader = new FinanceReadRepository({
    tableName: 'fixture',
    cursorSecret: 'fixture-secret-'.repeat(4),
    client: { send },
    authorize: async () => true,
  });
  await expect(
    reader.csvDuplicateOrdinals('a1', [
      {
        ordinal: 1,
        amountMinor: -100,
        transactedAt: '2026-10-01T12:00:00.000Z',
        description: 'Synthetic expense',
      },
    ]),
  ).rejects.toThrow('CSV duplicate check needs a narrower date range.');
  expect(send).toHaveBeenCalledTimes(1);
});
