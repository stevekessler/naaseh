import { describe, expect, it } from 'vitest';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { FinanceReadRepository } from '../../apps/api/src/finance/read-repository.js';
import {
  FinanceQueryJobService,
  DynamoFinanceQueryJobStore,
  type FinanceQueryJob,
  type FinanceQueryJobStore,
} from '../../apps/api/src/finance/query-job-service.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

function persistentJob(id = '01K7Q0Y0000000000000000001'): FinanceQueryJob {
  return {
    id,
    rowOrderVersion: 2,
    userId: 'u1',
    securityRevision: 1,
    sourceRevisions: { account: 'canonical' },
    filters: {},
    fingerprint: 'canonical-filter-and-source-fingerprint',
    partitions: [{ accountId: 'account', complete: false }],
    firstIds: [],
    totals: [],
    count: 0,
    examined: 0,
    state: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: Date.now() + 15 * 60_000,
    version: 1,
  };
}

function setup(
  accounts: number,
  count: number,
  legacyPrecision = false,
  preview?: 'ready' | 'exact' | 'revoke',
) {
  const facts = new Map<string, FinanceFact[]>();
  for (let a = 0; a < accounts; a++)
    facts.set(
      `a${a}`,
      Array.from({ length: count }, (_, i) => {
        const timestamp = new Date(Date.UTC(2026, 9, 31) - i * 1_000).toISOString();
        const effectiveAt =
          legacyPrecision && a === 0 && i % 2 === 0 ? timestamp.replace('.000Z', 'Z') : timestamp;
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
  let expireOnScan = false;
  let expireOnHydrate = false;
  let revokeOnHydrate = false;
  let now = Date.UTC(2026, 9, 31);
  const jobs = new Map<string, FinanceQueryJob>();
  const requests = new Map<string, string>();
  const queue: Array<{ userId: string; queryId: string }> = [];
  const hydrationSizes: number[] = [];
  let previewCalls = 0;
  const store: FinanceQueryJobStore = {
    create: async (job, requestId) => {
      const key = `${job.userId}:${requestId}`;
      const previous = requests.get(key);
      if (previous) {
        const saved = jobs.get(previous)!;
        if (saved.fingerprint !== job.fingerprint) throw new Error('Request conflict');
        return structuredClone(saved);
      }
      requests.set(key, job.id);
      jobs.set(job.id, structuredClone(job));
      return structuredClone(job);
    },
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
        if (expireOnScan) now += 16 * 60_000;
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
    cursorSecret: 'p'.repeat(32),
    now: () => now,
    validate: async () => allowed,
    authorizeDelivery: async () => allowed,
    authorizeFacts: async () => allowed,
    ...(preview
      ? {
          preview: async () => {
            previewCalls++;
            const all = [...facts.values()]
              .flat()
              .sort(
                (a, b) =>
                  Date.parse(b.effectiveAt) - Date.parse(a.effectiveAt) || b.id.localeCompare(a.id),
              );
            if (preview === 'revoke') allowed = false;
            return {
              firstIds: all
                .slice(0, 200)
                .map(({ id, accountId, effectiveAt }) => ({ id, accountId, effectiveAt })),
              ...(preview === 'exact'
                ? {
                    exact: {
                      count: all.length,
                      totals: all.length
                        ? [{ currency: 'USD', currencyExponent: 2, amountMinor: all.length * 100 }]
                        : [],
                    },
                  }
                : {}),
            };
          },
        }
      : {}),
    dispatch: async (job) => {
      queue.push(job);
    },
    hydrate: async (job) => {
      hydrationSizes.push(job.firstIds.length);
      if (expireOnHydrate) now += 16 * 60_000;
      if (revokeOnHydrate) allowed = false;
      return job.firstIds.map((ref) => facts.get(ref.accountId)!.find((f) => f.id === ref.id)!);
    },
  });
  return {
    service,
    queue,
    jobs,
    hydrationSizes,
    get previewCalls() {
      return previewCalls;
    },
    get maxActive() {
      return maxActive;
    },
    revoke() {
      allowed = false;
    },
    revokeDuringHydration() {
      revokeOnHydrate = true;
    },
    expireDuringHydration() {
      expireOnHydrate = true;
    },
    expireDuringScan() {
      expireOnScan = true;
    },
    advance(minutes = 16) {
      now += minutes * 60_000;
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
  it('delivers a stable first window before exact aggregates and deduplicates preview references during automatic completion', async () => {
    const f = setup(2, 1200, false, 'ready');
    const id = await f.service.create(f.input);
    const first = await f.service.page('u1', id);
    expect(first).toMatchObject({
      rowsState: 'ready',
      aggregateState: 'pending',
      complete: false,
      coverage: { scopeComplete: false },
    });
    expect(first.totalCount).toBeUndefined();
    expect(first.items).toHaveLength(50);
    expect(f.queue).not.toHaveLength(0);
    while (f.queue.length) {
      const job = f.queue.shift()!;
      await f.service.step(job.userId, job.queryId);
    }
    const complete = await f.service.page('u1', id);
    expect(complete.items).toEqual(first.items);
    expect(complete).toMatchObject({
      totalCount: 2400,
      aggregateState: 'exact',
      totalsByCurrency: [{ amountMinor: 240000 }],
    });
    expect((await f.service.page('u1', id, { cursor: first.nextCursor })).items).toHaveLength(50);
    expect(new Set(f.jobs.get(id)!.firstIds.map((row) => row.id)).size).toBe(200);
  });

  it('finishes a proven small or empty preview without a worker and preserves request retry identity', async () => {
    for (const count of [0, 10]) {
      const f = setup(1, count, false, 'exact');
      const input = { ...f.input, requestId: 'same-preview' };
      const id = await f.service.create(input);
      expect(await f.service.create(input)).toBe(id);
      expect(f.previewCalls).toBe(1);
      expect(f.queue).toHaveLength(0);
      expect(await f.service.page('u1', id)).toMatchObject({
        rowsState: count ? 'ready' : 'confirmed-empty',
        aggregateState: 'exact',
        totalCount: count,
      });
    }
  });

  it('does not publish preview rows or dispatch work when source authority changes during the read', async () => {
    const f = setup(1, 500, false, 'revoke');
    await expect(f.service.create(f.input)).rejects.toThrow(/source|authoriz|access/i);
    expect(f.queue).toHaveLength(0);
    expect([...f.jobs.values()][0]).toMatchObject({ state: 'pending', firstIds: [], version: 1 });
  });
  it('pages all matching rows beyond the retained 200 in stable cross-account order with root totals', async () => {
    const f = setup(3, 350, true);
    const id = await f.service.create(f.input);
    const drain = async () => {
      let steps = 0;
      while (f.queue.length) {
        const next = f.queue.shift()!;
        await f.service.step(next.userId, next.queryId);
        if (++steps > 100) throw new Error('Query did not finish');
      }
    };
    await drain();
    const ids: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      let page = await f.service.page('u1', id, { cursor });
      if (page.rowsState === 'searching') {
        await drain();
        page = await f.service.page('u1', id, { cursor });
      }
      expect(page).toMatchObject({
        queryId: id,
        aggregateState: 'exact',
        totalCount: 1050,
        totalsByCurrency: [{ currency: 'USD', amountMinor: 105000 }],
      });
      expect(page.items.length).toBeLessThanOrEqual(50);
      ids.push(...page.items.map((fact) => fact.id));
      cursor = page.nextCursor;
      if (cursor) expect(cursor).toMatch(/^v2\.[\w-]+\.[\w-]+\.[\w-]+$/);
      if (++pages > 30) throw new Error('Page cursor did not finish');
    } while (cursor);
    const expected = Array.from({ length: 350 }, (_, index) =>
      [2, 1, 0].map((account) => `t${account}-${String(index).padStart(5, '0')}`),
    ).flat();
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(1050);
    expect(Math.max(...f.hydrationSizes)).toBeLessThanOrEqual(50);
    expect(f.jobs.size).toBe(6);
    expect(f.maxActive).toBeLessThanOrEqual(5);
    const empty = setup(1, 0);
    const emptyId = await empty.service.create(empty.input);
    await empty.service.step('u1', emptyId);
    expect(await empty.service.page('u1', emptyId)).toMatchObject({
      items: [],
      rowsState: 'confirmed-empty',
      totalCount: 0,
    });
  });

  it('keeps incomplete pages pending, reuses continuation work and inherits the root expiry', async () => {
    const f = setup(1, 550);
    const id = await f.service.create(f.input);
    expect(await f.service.page('u1', id)).toMatchObject({
      items: [],
      rowsState: 'searching',
      aggregateState: 'pending',
      complete: false,
    });
    await f.service.step('u1', id);
    const first = await f.service.page('u1', id, { limit: 200 });
    expect(first.items).toHaveLength(200);
    expect(first.nextCursor).toBeTruthy();
    f.advance(1);
    for (let attempt = 0; attempt < 2; attempt++) {
      const pending = await f.service.page('u1', id, { cursor: first.nextCursor });
      expect(pending.rowsState).toBe('searching');
      expect(pending.totalCount).toBeUndefined();
    }
    expect(f.jobs.size).toBe(2);
    const continuation = [...f.jobs.values()].find((job) => job.id !== id)!;
    expect(continuation).toMatchObject({ parentQueryId: id, expiresAt: f.jobs.get(id)!.expiresAt });
    while (f.queue.length) {
      const next = f.queue.shift()!;
      await f.service.step(next.userId, next.queryId);
    }
    const saved = structuredClone(f.jobs.get(continuation.id)!);
    f.jobs.set(continuation.id, { ...saved, count: 200 });
    await expect(
      f.service.page('u1', id, { cursor: first.nextCursor, limit: 200 }),
    ).rejects.toThrow(/invariant|incomplete/i);
    f.jobs.set(continuation.id, saved);
    const second = await f.service.page('u1', id, { cursor: first.nextCursor, limit: 200 });
    expect(second.items).toHaveLength(200);
    expect(second.nextCursor).toBeTruthy();
    expect(second.totalCount).toBe(550);
    f.advance();
    await expect(f.service.page('u1', id, { cursor: first.nextCursor })).rejects.toThrow(
      /expired/i,
    );
  });

  it('binds encrypted page cursors to owner/query context and rejects invalid limits or tampering', async () => {
    const f = setup(1, 80);
    const id = await f.service.create(f.input);
    await f.service.step('u1', id);
    const first = await f.service.page('u1', id);
    const other = await f.service.create(f.input);
    await f.service.step('u1', other);
    await expect(f.service.page('u2', id, { cursor: first.nextCursor })).rejects.toThrow(
      /missing|expired/i,
    );
    await expect(f.service.page('u1', other, { cursor: first.nextCursor })).rejects.toThrow(
      /cursor/i,
    );
    await expect(f.service.page('u1', id, { cursor: first.nextCursor + 'x' })).rejects.toThrow(
      /cursor/i,
    );
    for (const limit of [0, 201, 1.5])
      await expect(f.service.page('u1', id, { limit })).rejects.toThrow();
    expect(
      (await f.service.page('u1', id, { cursor: first.nextCursor, limit: 25 })).items,
    ).toHaveLength(25);
  });

  it('withholds page rows and totals if access is revoked during hydration', async () => {
    const f = setup(1, 10);
    const id = await f.service.create(f.input);
    await f.service.step('u1', id);
    f.revokeDuringHydration();
    await expect(f.service.page('u1', id)).rejects.toThrow(/access|authorization/i);
  });

  it('withholds page rows and totals if hydration crosses the query expiry', async () => {
    const f = setup(1, 10);
    const id = await f.service.create(f.input);
    await f.service.step('u1', id);
    f.expireDuringHydration();
    await expect(f.service.page('u1', id)).rejects.toThrow(/expired/i);
  });

  it('reuses an owner request identity and returns its current worker checkpoint without another write', async () => {
    const f = financePersistenceFixture();
    const store = new DynamoFinanceQueryJobStore(
      () => new FinanceUnitOfWork(f.persistence, 'table'),
    );
    const job = {
      ...persistentJob(),
      firstIds: Array.from({ length: 200 }, (_, index) => ({
        id: `01K7Q0Y${String(index).padStart(19, '0')}`,
        accountId: 'account',
        effectiveAt: '2026-10-31T12:00:00.000Z',
      })),
    };
    expect(await store.create(job, 'request-1')).toEqual(job);
    const stored = [...f.rows.values()].find((row) => row.SK === `FINANCE_QUERY#${job.id}`)!;
    expect(stored.data).not.toHaveProperty('firstIds');
    expect(Buffer.byteLength(JSON.stringify(stored.data))).toBeLessThan(
      Buffer.byteLength(JSON.stringify(job)) * 0.8,
    );
    f.rows.set(f.key(stored), { ...stored, data: job });
    expect(await store.get(job.userId, job.id)).toEqual(job); // Prior plain checkpoints still read.
    f.rows.set(f.key(stored), {
      ...stored,
      data: {
        ...(stored.data as object),
        rowReferences: [['private', 99, '2026-10-31T12:00:00Z']],
      },
    });
    await expect(store.get(job.userId, job.id)).rejects.toThrow(/reference/i);
    f.rows.set(f.key(stored), stored);
    const advanced = { ...job, state: 'exact' as const, count: 2, version: 2 };
    await store.save(advanced, 1);
    const before = f.writes;
    expect(await store.create(persistentJob('01K7Q0Y0000000000000000002'), 'request-1')).toEqual(
      advanced,
    );
    expect(f.writes).toBe(before);
    expect(
      [...f.rows.values()].filter(
        (row) => row.SK.startsWith('FINANCE_QUERY#') && !row.SK.includes('#STEP#'),
      ),
    ).toHaveLength(1);
    expect(JSON.stringify([...f.rows.keys()])).not.toContain('request-1');
  });

  it('recovers a lost creation response and collapses concurrent identical request retries atomically', async () => {
    const f = financePersistenceFixture();
    f.loseResponseAt(1);
    const store = new DynamoFinanceQueryJobStore(
      () => new FinanceUnitOfWork(f.persistence, 'table'),
    );
    const [first, second] = await Promise.all([
      store.create(persistentJob(), 'same-request'),
      store.create(persistentJob('01K7Q0Y0000000000000000002'), 'same-request'),
    ]);
    expect(first.id).toBe(second.id);
    expect(f.writes).toBeLessThanOrEqual(2);
    expect([...f.rows.values()].filter((row) => row.SK.startsWith('FINANCE_QUERY#'))).toHaveLength(
      1,
    );
    expect(await store.get('another-owner', first.id)).toBeUndefined();
    f.loseResponseAt(f.writes + 1);
    const advanced = { ...first, version: 2, count: 2, workerNonce: 'winner' };
    const [saved, retried] = await Promise.all([
      store.save(advanced, 1),
      store.save({ ...advanced, workerNonce: 'competitor' }, 1),
    ]);
    expect(saved).toEqual(retried);
    expect(saved).toMatchObject({ version: 2, count: 2 });
    const receipt = [...f.rows.values()].find((row) => row.SK.includes('#STEP#1'))!;
    expect(receipt.result).toEqual({ queryId: first.id });
    expect(JSON.stringify(receipt).length).toBeLessThan(500);
  });

  it('rejects invalid request identities and changed-scope reuse without modifying the original job', async () => {
    const f = financePersistenceFixture();
    const store = new DynamoFinanceQueryJobStore(
      () => new FinanceUnitOfWork(f.persistence, 'table'),
    );
    for (const requestId of ['', ' ', 'x'.repeat(201)])
      await expect(store.create(persistentJob(), requestId)).rejects.toMatchObject({ status: 400 });
    expect(f.writes).toBe(0);
    const job = persistentJob();
    await store.create(job, 'stable-request');
    await expect(
      store.create(
        { ...persistentJob('01K7Q0Y0000000000000000002'), fingerprint: 'different-private-scope' },
        'stable-request',
      ),
    ).rejects.toMatchObject({ status: 409, code: 'finance_query_request_conflict' });
    expect(await store.get('u1', job.id)).toEqual(job);
    expect(f.writes).toBe(1);

    const race = financePersistenceFixture();
    const racing = new DynamoFinanceQueryJobStore(
      () => new FinanceUnitOfWork(race.persistence, 'table'),
    );
    const competing = await Promise.allSettled([
      racing.create(persistentJob(), 'competing-request'),
      racing.create(
        { ...persistentJob('01K7Q0Y0000000000000000002'), fingerprint: 'another-private-scope' },
        'competing-request',
      ),
    ]);
    expect(competing.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(competing.find((result) => result.status === 'rejected')).toMatchObject({
      status: 'rejected',
      reason: { status: 409, code: 'finance_query_request_conflict' },
    });
    expect(
      [...race.rows.values()].filter((row) => row.SK.startsWith('FINANCE_QUERY#')),
    ).toHaveLength(1);
  });

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
    const legacy = setup(1, 10);
    const legacyId = await legacy.service.create(legacy.input);
    delete (legacy.jobs.get(legacyId)! as Partial<FinanceQueryJob>).rowOrderVersion;
    await expect(legacy.service.status('u1', legacyId)).rejects.toThrow(/format|restart/i);
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

  it('withholds exact rows and totals when the query expires during result hydration', async () => {
    const f = setup(1, 10);
    const id = await f.service.create(f.input);
    await f.service.step('u1', id);
    f.expireDuringHydration();
    await expect(f.service.status('u1', id)).rejects.toThrow(/expired/i);
  });

  it('does not publish another checkpoint when a bounded worker scan crosses query expiry', async () => {
    const f = setup(1, 10);
    const id = await f.service.create(f.input);
    f.expireDuringScan();
    await expect(f.service.step('u1', id)).rejects.toThrow(/expired/i);
    expect(f.jobs.get(id)).toMatchObject({ version: 1, state: 'pending', count: 0 });
  });
});
