import { expect, it } from 'vitest';
import {
  browseFinanceSpendReport,
  parseSpendReportRequest,
} from '../../apps/api/src/finance/spend-report-service.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import {
  FinanceQueryJobService,
  type FinanceQueryJob,
} from '../../apps/api/src/finance/query-job-service.js';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

const account = '01J00000000000000000000601';
const budget = '01J00000000000000000000602';
const category = '01J00000000000000000000603';
const merchant = '01J00000000000000000000604';
const alternate = '01J00000000000000000000605';
const subcategory = '01J00000000000000000000606';
const context = { userId: 'owner', securityRevision: 3 };
const now = new Date('2026-11-15T00:00:00Z');

it('counts matching allocation principal once and preserves refund signs and currency', async () => {
  const filters = new URLSearchParams();
  for (const [key, value] of Object.entries({
    accountIds: account,
    budgetIds: budget,
    categoryIds: category,
    subcategoryIds: subcategory,
    merchantIds: merchant,
    dateFrom: '2026-11-01',
    dateTo: '2026-11-30',
    timeZone: 'UTC',
  }))
    filters.append(key, value);
  filters.append('categoryIds', alternate);
  const request = parseSpendReportRequest(filters.toString(), [account], now);
  const base = {
    accountId: account,
    merchantId: merchant,
    categoryId: category,
    budgetId: budget,
    subcategoryId: subcategory,
    effectiveAt: '2026-11-09T12:00:00Z',
    currency: 'USD',
    currencyExponent: 2,
  };
  const fixtures = [
    { ...base, transactionId: 'split', amountMinor: 600 },
    { ...base, transactionId: 'split', amountMinor: 400, subcategoryId: alternate },
    { ...base, transactionId: 'refund', amountMinor: -200, originalExpenseTransactionId: 'split' },
    { ...base, transactionId: 'cad', amountMinor: 700, currency: 'CAD', categoryId: alternate },
    { ...base, transactionId: 'old', amountMinor: 100, effectiveAt: '2026-10-30T12:00:00Z' },
  ];
  const grouped = new Map<string, FinanceFact>();
  for (const slice of fixtures) {
    const existing = grouped.get(slice.transactionId);
    if (existing) existing.slices.push(slice);
    else
      grouped.set(slice.transactionId, {
        id: slice.transactionId,
        accountId: slice.accountId,
        effectiveAt: slice.effectiveAt,
        merchantId: merchant,
        description: slice.transactionId,
        amountMinor: -slice.amountMinor,
        currency: slice.currency,
        currencyExponent: slice.currencyExponent,
        sourceVersion: 1,
        slices: [slice],
      });
  }
  const source = fixture([...grouped.values()]);
  await browseFinanceSpendReport(source.runtime, context, request);
  await source.drain();
  const result = await source.read();
  expect(result.items.map(({ id }) => id).sort()).toEqual(['cad', 'refund', 'split']);
  expect(source.readPartitions.every((key) => key.includes('#budget#' + budget + '#'))).toBe(true);
  expect(result.totalCount).toBe(3);
  expect(result.totalsByCurrency).toEqual([
    { currency: 'CAD', currencyExponent: 2, amountMinor: 700 },
    { currency: 'USD', currencyExponent: 2, amountMinor: 400 },
  ]);
});

function fixture(facts: FinanceFact[]) {
  const ordered = [...facts].sort(
    (a, b) => b.effectiveAt.localeCompare(a.effectiveAt) || b.id.localeCompare(a.id),
  );
  const indexed = new Map(facts.map((fact) => [fact.id, fact]));
  const jobs = new Map<string, FinanceQueryJob>();
  const queued: { userId: string; queryId: string }[] = [];
  const readPartitions: string[] = [];
  let maximumRead = 0;
  let authorized = true;
  let root = '';
  const repository = new FinanceReadRepository({
    tableName: 'fixture',
    cursorSecret: 'r'.repeat(32),
    authorize: async () => authorized,
    client: {
      send: async (command) => {
        if (!(command instanceof QueryCommand)) throw new Error('Expected bounded query.');
        const PK = String(command.input.ExpressionAttributeValues?.[':pk']);
        const key = command.input.ExclusiveStartKey?.SK;
        readPartitions.push(PK);
        const keyFor = (fact: FinanceFact) => 'DATE#' + fact.effectiveAt + '#' + fact.id;
        const after = key ? ordered.findIndex((fact) => keyFor(fact) === key) + 1 : 0;
        const page = ordered.slice(after, after + command.input.Limit!);
        maximumRead = Math.max(maximumRead, page.length);
        return {
          Items: page.map((fact) => ({ PK, SK: keyFor(fact), fact })),
          ScannedCount: page.length,
          ...(after + page.length < ordered.length
            ? { LastEvaluatedKey: { PK, SK: keyFor(page.at(-1)!) } }
            : {}),
        };
      },
    },
  });
  const service = new FinanceQueryJobService({
    repository,
    store: {
      get: async (owner, id) =>
        jobs.get(id)?.userId === owner ? structuredClone(jobs.get(id)) : undefined,
      save: async (job) => {
        jobs.set(job.id, structuredClone(job));
        return job;
      },
    },
    cursorSecret: 'p'.repeat(32),
    authorizeDelivery: async () => authorized,
    authorizeFacts: async () => authorized,
    validate: async () => authorized,
    dispatch: async (item) => {
      queued.push(item);
    },
    hydrate: async (job) => job.firstIds.map(({ id }) => indexed.get(id)!),
    preview: async (job) => {
      const result = await repository.scanForJob({
        userId: job.userId,
        securityRevision: job.securityRevision,
        accountId: account,
        sourceRevision: 'source-revision',
        filters: job.filters,
        limit: 200,
      });
      if (result.nextCursor && result.topRows.length < 200) return undefined;
      return {
        firstIds: result.topRows,
        examined: result.examined,
        ...(result.nextCursor
          ? {}
          : {
              exact: { count: result.matchedCount, totals: result.totalsByCurrency },
            }),
      };
    },
  });
  const runtime = {
    start: async (userId: string, securityRevision: number, input: unknown) => {
      const request = input as NonNullable<ReturnType<typeof parseSpendReportRequest>['query']>;
      root = await service.create({
        userId,
        securityRevision,
        accountIds: request.accountIds,
        filters: request.filters,
        sourceRevisions: { [account]: 'source-revision' },
      });
      return root;
    },
    page: (user: string, id: string, request: unknown) => service.page(user, id, request),
  };
  return {
    runtime,
    readPartitions,
    maximumRead: () => maximumRead,
    revoke: () => {
      authorized = false;
    },
    read: (cursor?: string) => service.page(context.userId, root, cursor ? { cursor } : {}),
    readAsGuest: () => service.page('guest', root),
    drain: async () => {
      while (queued.length) {
        const item = queued.shift()!;
        await service.step(item.userId, item.queryId);
      }
    },
  };
}

it.each(['dense', 'sparse', 'empty'] as const)(
  'measures actual row and exact aggregate readiness for cold %s facts',
  async (mode) => {
    const facts: FinanceFact[] = Array.from({ length: 1250 }, (_, index) => {
      const id = String(index + 1);
      const effectiveAt = new Date(Date.UTC(2026, 10, 15) - index * 1000).toISOString();
      const matches = mode === 'dense' || (mode === 'sparse' && index === 1140);
      const principal = { currency: 'USD', currencyExponent: 2, accountId: account, effectiveAt };
      return {
        ...principal,
        id,
        description: 'Fixture',
        amountMinor: -100,
        sourceVersion: 1,
        slices: matches ? [{ ...principal, transactionId: id, amountMinor: 100 }] : [],
      };
    });
    const source = fixture(facts);
    const request = parseSpendReportRequest('timeZone=UTC', [account], now);
    const start = performance.now();
    const first = await browseFinanceSpendReport(source.runtime, context, request);
    let rowsAt = first.rowsState === 'searching' ? undefined : performance.now() - start;
    if (mode === 'dense') {
      expect(first.rowsState).toBe('ready');
      expect(first.items).toHaveLength(50);
      expect(first.aggregateState).toBe('pending');
      expect(first.totalCount).toBeUndefined();
    } else {
      expect(first.rowsState).toBe('searching');
    }
    await source.drain(); // No client paging or polling drives aggregate completion.
    const result = await source.read();
    rowsAt ??= performance.now() - start;
    const exactAt = performance.now() - start;
    expect(rowsAt).toBeLessThan(2_000);
    expect(exactAt).toBeLessThan(10_000);
    expect(result.totalCount).toBe(mode === 'dense' ? 1250 : mode === 'sparse' ? 1 : 0);
    expect(result.rowsState).toBe(mode === 'empty' ? 'confirmed-empty' : 'ready');
    expect(result.aggregateState).toBe('exact');
    expect(result.totalsByCurrency).toEqual(
      mode === 'empty'
        ? []
        : [{ currency: 'USD', currencyExponent: 2, amountMinor: mode === 'dense' ? 125_000 : 100 }],
    );
    expect(source.maximumRead()).toBeLessThanOrEqual(1000);
    if (result.nextCursor) {
      const next = await source.read(result.nextCursor);
      expect(next.items).toHaveLength(50);
      expect(next.items.some(({ id }) => result.items.some((previous) => previous.id === id))).toBe(
        false,
      );
      expect(next.projectionRevision).toBe(result.projectionRevision);
    }
    await expect(source.readAsGuest()).rejects.toThrow();
    source.revoke();
    await expect(source.read()).rejects.toThrow();
    console.info(
      'Spend fixture %s rows %s ms, exact %s ms',
      mode,
      rowsAt.toFixed(2),
      exactAt.toFixed(2),
    );
  },
);
