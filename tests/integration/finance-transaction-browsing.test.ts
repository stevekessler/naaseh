import { FinanceSyncSourceGuard } from '../../apps/api/src/finance/sync-source-guard.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { describe, expect, it } from 'vitest';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import {
  FinanceQueryJobService,
  type FinanceQueryJob,
} from '../../apps/api/src/finance/query-job-service.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

function browsingFixture() {
  const facts = new Map<string, FinanceFact[]>();
  for (const accountId of ['selected', 'shared', 'excluded']) {
    facts.set(
      accountId,
      Array.from({ length: 1250 }, (_, index) => {
        const id = accountId + '-' + index;
        const effectiveAt = new Date(Date.UTC(2026, 9, 31) - index * 1000).toISOString();
        return {
          id,
          accountId,
          effectiveAt,
          description: index === 1130 ? 'Sparse match' : 'Other transaction',
          currency: 'USD',
          currencyExponent: 2,
          amountMinor: index === 1130 ? -125 : -100,
          sourceVersion: 1,
          slices: [
            {
              transactionId: id,
              accountId,
              effectiveAt,
              currency: 'USD',
              currencyExponent: 2,
              amountMinor: 125,
            },
          ],
        };
      }),
    );
  }

  const jobs = new Map<string, FinanceQueryJob>();
  const queue: Array<{ userId: string; queryId: string }> = [];
  const inspectedAccounts = new Set<string>();
  let maximumRead = 0;
  let current = true;
  const repository = new FinanceReadRepository({
    tableName: 'fixture',
    cursorSecret: 'c'.repeat(32),
    authorize: async () => current,
    client: {
      send: async (command) => {
        if (!(command instanceof QueryCommand)) throw new Error('Unexpected lookup');
        const pk = String(command.input.ExpressionAttributeValues?.[':pk']);
        const accountId = pk.split('#').at(-1)!;
        inspectedAccounts.add(accountId);
        const rows = (facts.get(accountId) ?? []).map((fact) => ({
          PK: pk,
          SK: 'DATE#' + fact.effectiveAt + '#' + fact.id,
          fact,
        }));
        const after = command.input.ExclusiveStartKey?.SK;
        const offset = after ? rows.findIndex((row) => row.SK === after) + 1 : 0;
        const items = rows.slice(offset, offset + (command.input.Limit ?? 1000));
        maximumRead = Math.max(maximumRead, items.length);
        const last = items.at(-1);
        return {
          Items: items,
          ScannedCount: items.length,
          ...(last && offset + items.length < rows.length
            ? { LastEvaluatedKey: { PK: last.PK, SK: last.SK } }
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
    validate: async () => current,
    authorizeDelivery: async () => current,
    authorizeFacts: async () => current,
    dispatch: async (job) => {
      queue.push(job);
    },
    hydrate: async (job) =>
      job.firstIds.map(
        ({ accountId, id }) => facts.get(accountId)!.find((fact) => fact.id === id)!,
      ),
  });
  return {
    service,
    inspectedAccounts,
    maximumRead: () => maximumRead,
    revoke: () => {
      current = false;
    },
    advance: async () => {
      const job = queue.shift();
      if (job) await service.step(job.userId, job.queryId);
      return Boolean(job);
    },
    create: (accountIds: string[], amountMax: number) =>
      service.create({
        userId: 'owner',
        accountIds,
        securityRevision: 1,
        sourceRevisions: Object.fromEntries(accountIds.map((id) => [id, 'revision'])),
        filters: { amountMax, transactionBrowse: true },
      }),
  };
}

describe('bounded transaction browsing', () => {
  it.each([
    ['one selected source', ['selected'], -125, 1],
    ['multiple selected sources', ['selected', 'shared'], -125, 2],
    ['a verified zero', ['selected', 'shared'], -126, 0],
  ] as const)(
    'returns actual cold results and exact aggregates for %s',
    async (_, scope, amountMax, expected) => {
      const fixture = browsingFixture();
      const start = performance.now();
      const id = await fixture.create([...scope], amountMax);
      const first = await fixture.service.page('owner', id);
      if (first.rowsState === 'searching') expect(first.totalCount).toBeUndefined();
      let rowsReadyAt: number | undefined;
      let result = first;
      while (await fixture.advance()) {
        result = await fixture.service.page('owner', id);
        if (result.rowsState === 'searching') expect(result.totalCount).toBeUndefined();
        else rowsReadyAt ??= performance.now();
      }
      rowsReadyAt ??= result.rowsState === 'searching' ? Infinity : performance.now();
      expect(rowsReadyAt - start).toBeLessThan(2000);
      expect(performance.now() - start).toBeLessThan(10000);
      expect(result.rowsState).toBe(expected ? 'ready' : 'confirmed-empty');
      expect(result.items).toHaveLength(expected);
      expect(result.aggregateState).toBe('exact');
      expect(result.totalCount).toBe(expected);
      expect(result.totalsByCurrency).toEqual(
        expected ? [{ currency: 'USD', currencyExponent: 2, amountMinor: expected * -125 }] : [],
      );
      expect([...fixture.inspectedAccounts].sort()).toEqual([...scope].sort());
      expect(fixture.maximumRead()).toBeLessThanOrEqual(1000);

      fixture.revoke();
      await expect(fixture.service.page('owner', id)).rejects.toThrow(/changed/u);
    },
  );
});

it('suppresses linked budget and refund metadata across current source boundaries', async () => {
  const fixture = financePersistenceFixture();
  const owner = 'FINANCE#SCOPE#OWNER#owner';
  const group = 'FINANCE#SCOPE#GROUP#shared';
  const credit = '01J00000000000000000000611';
  const original = '01J00000000000000000000612';
  const savedAt = '2026-11-14T00:00:00.000Z';
  function seed(
    collection: string,
    key: string,
    value: Record<string, unknown>,
    partition = owner,
  ) {
    const storageKey = { PK: partition, SK: 'ROW#' + collection + '#' + key };
    const locator = financeLocatorKey(collection, key);
    const scope = { PK: partition, SK: 'META' };
    fixture.rows.set(fixture.key(locator), { ...locator, storageKey });
    fixture.rows.set(fixture.key(scope), { ...scope, revision: 1 });
    fixture.rows.set(fixture.key(storageKey), {
      ...storageKey,
      collection,
      entryKey: key,
      data: { id: key, status: 'active', version: 1, ...value },
    });
  }
  seed('accounts', 'credit-account', { scope: { type: 'owner', ownerId: 'owner' } });
  seed('accounts', 'expense-account', { scope: { type: 'group', groupId: 'shared' } }, group);
  seed('budgets', 'shared-budget', { groupId: 'shared', name: 'Shared plan' }, group);
  seed('budgetItems', 'shared-item', { budgetId: 'shared-budget' }, group);
  seed(
    'transactions',
    original,
    {
      accountId: 'expense-account',
      description: 'Shared expense',
      amountMinor: -100,
      allocations: [],
    },
    group,
  );
  seed('transactions', credit, {
    accountId: 'credit-account',
    description: 'Credit',
    amountMinor: 25,
    allocations: [{ id: 'allocation', budgetItemId: 'shared-item' }],
  });
  seed('refundRelationships', credit, {
    id: '01J00000000000000000000613',
    refundTransactionId: credit,
    originalExpenseTransactionId: original,
    linkedAmountMinor: 25,
    currency: 'USD',
    currencyExponent: 2,
    refundedAllocations: [
      { originalAllocationId: 'allocation', amountMinor: 25, originalAllocationRevision: 1 },
    ],
    refundSourceVersion: 1,
    originalSourceVersion: 1,
    calculationState: 'valid',
    createdBy: 'owner',
    createdAt: savedAt,
    updatedAt: savedAt,
  });

  let allowed = true;
  const guard = () =>
    new FinanceSyncSourceGuard({
      userId: 'owner',
      role: 'user',
      work: () => new FinanceUnitOfWork(fixture.persistence, 'fixture'),
      membership: async (groupId, userId) =>
        allowed ? { groupId, userId, status: 'active', role: 'member', version: 1 } : undefined,
    });
  const authorized = guard();
  const visible = await authorized.readTransactionForBrowsing(credit);
  expect(visible?.budgetLinks).toEqual([{ id: 'shared-budget', name: 'Shared plan' }]);
  expect(visible).toMatchObject({
    refundOriginal: { id: original, description: 'Shared expense' },
  });
  allowed = false;
  await expect(authorized.assertCurrent()).rejects.toThrow();
  const hidden = await guard().readTransactionForBrowsing(credit);
  expect(hidden).toMatchObject({
    id: credit,
    budgetLinks: [],
    allocations: [],
    canEditAllocations: false,
  });
  expect(JSON.stringify(hidden)).not.toMatch(/Shared|shared-item|shared-budget|refundOriginal/u);
});
