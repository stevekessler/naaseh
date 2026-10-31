import { describe, expect, it } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import {
  FinanceQueryJobService,
  type FinanceQueryJob,
  type FinanceQueryJobStore,
} from '../../apps/api/src/finance/query-job-service.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';

function setup(accounts: number, count: number) {
  const facts = new Map<string, FinanceFact[]>();
  for (let a = 0; a < accounts; a++)
    facts.set(
      `a${a}`,
      Array.from({ length: count }, (_, i) => {
        const effectiveAt = new Date(Date.UTC(2026, 9, 31) - i * 1_000).toISOString();
        return {
          id: `t${a}-${String(i).padStart(5, '0')}`,
          accountId: `a${a}`,
          effectiveAt,
          description: 'Synthetic',
          currency: 'USD',
          currencyExponent: 2,
          amountMinor: -100,
          sourceVersion: 1,
          slices: [
            {
              transactionId: `t${a}-${i}`,
              accountId: `a${a}`,
              effectiveAt,
              currency: 'USD',
              currencyExponent: 2,
              amountMinor: 100,
            },
          ],
        };
      }),
    );
  let active = 0;
  let maxActive = 0;
  let allowed = true;
  let now = Date.UTC(2026, 9, 31);
  const jobs = new Map<string, FinanceQueryJob>();
  const queue: Array<{ userId: string; queryId: string }> = [];
  const store: FinanceQueryJobStore = {
    get: async (userId, id) => {
      const job = jobs.get(id);
      return job?.userId === userId ? structuredClone(job) : undefined;
    },
    save: async (job, expected) => {
      const current = jobs.get(job.id);
      if ((current?.version ?? 0) !== expected) {
        if (current) return structuredClone(current);
        throw new Error('Checkpoint conflict');
      }
      jobs.set(job.id, structuredClone(job));
      return structuredClone(job);
    },
  };
  const repository = new FinanceReadRepository({
    tableName: 'table',
    cursorSecret: 'j'.repeat(32),
    authorize: async () => allowed,
    client: {
      send: async (command) => {
        if (!(command instanceof QueryCommand)) throw new Error('Unexpected non-index read.');
        active++;
        maxActive = Math.max(maxActive, active);
        await Promise.resolve();
        const accountId = String(command.input.ExpressionAttributeValues?.[':pk'])
          .split('#')
          .at(-1)!;
        const values = facts.get(accountId)!;
        const last = command.input.ExclusiveStartKey?.SK as string | undefined;
        const offset = last
          ? values.findIndex((f) => `DATE#${f.effectiveAt}#${f.id}` === last) + 1
          : 0;
        const page = values.slice(offset, offset + 1_000);
        const final = page.at(-1)!;
        active--;
        return {
          Items: page.map((fact) => ({
            PK: String(command.input.ExpressionAttributeValues?.[':pk']),
            SK: `DATE#${fact.effectiveAt}#${fact.id}`,
            fact,
          })),
          ScannedCount: page.length,
          ...(offset + page.length < values.length
            ? {
                LastEvaluatedKey: {
                  PK: command.input.ExpressionAttributeValues?.[':pk'],
                  SK: `DATE#${final.effectiveAt}#${final.id}`,
                },
              }
            : {}),
        };
      },
    },
  });
  const service = new FinanceQueryJobService({
    repository,
    store,
    now: () => now,
    validate: async () => allowed,
    authorizeDelivery: async () => allowed,
    dispatch: async (job) => {
      queue.push(job);
    },
    hydrate: async (job) =>
      job.firstIds.map((ref) => facts.get(ref.accountId)!.find((f) => f.id === ref.id)!),
  });
  return {
    service,
    queue,
    jobs,
    get maxActive() {
      return maxActive;
    },
    revoke() {
      allowed = false;
    },
    advance() {
      now += 16 * 60_000;
    },
    input: {
      userId: 'u1',
      accountIds: [...facts.keys()],
      sourceRevisions: Object.fromEntries([...facts.keys()].map((id) => [id, 'r1'])),
      securityRevision: 1,
      filters: {},
    },
  };
}

describe('automatic bounded Finance query completion', () => {
  it('finishes exact full-scope totals without browser pagination and limits concurrency to five partitions', async () => {
    const f = setup(7, 2_500);
    const id = await f.service.create(f.input);
    expect(await f.service.status('u1', id)).toMatchObject({
      rowsState: 'searching',
      aggregateState: 'pending',
    });
    let steps = 0;
    while (f.queue.length) {
      const job = f.queue.shift()!;
      await f.service.step(job.userId, job.queryId);
      if (++steps > 20) throw new Error('Did not automatically finish');
    }
    const result = await f.service.status('u1', id);
    expect(result).toMatchObject({
      totalCount: 17_500,
      aggregateState: 'exact',
      coverage: { examined: 17_500, scopeComplete: true },
      totalsByCurrency: [{ currency: 'USD', amountMinor: 1_750_000 }],
    });
    expect(result.items).toHaveLength(200);
    expect(f.maxActive).toBe(5);
    expect(result.items.map((f) => `${f.effectiveAt}:${f.id}`)).toEqual(
      [...result.items.map((f) => `${f.effectiveAt}:${f.id}`)].sort().reverse(),
    );
  });

  it('denies another owner, expired checkpoints and revoked access before delivering any rows or totals', async () => {
    const f = setup(1, 10);
    const id = await f.service.create(f.input);
    await f.service.step('u1', id);
    await expect(f.service.status('u2', id)).rejects.toThrow(/missing|expired/i);
    f.revoke();
    await expect(f.service.status('u1', id)).rejects.toThrow(/authoriz|restart/i);
    const expired = setup(1, 10);
    const expiredId = await expired.service.create(expired.input);
    expired.advance();
    await expect(expired.service.step('u1', expiredId)).rejects.toThrow(/expired/i);
  });

  it('conditions competing workers so a repeated checkpoint never duplicates contribution totals', async () => {
    const f = setup(1, 2_500);
    const id = await f.service.create(f.input);
    await Promise.all([f.service.step('u1', id), f.service.step('u1', id)]);
    while (f.queue.length) {
      const job = f.queue.shift()!;
      await f.service.step(job.userId, job.queryId);
    }
    expect(await f.service.status('u1', id)).toMatchObject({
      totalCount: 2_500,
      totalsByCurrency: [{ amountMinor: 250_000 }],
      aggregateState: 'exact',
    });
  });
});
