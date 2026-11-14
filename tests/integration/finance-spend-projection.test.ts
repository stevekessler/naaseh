import { describe, expect, it } from 'vitest';
import {
  createFinanceFact,
  financeFactReferences,
  SpendProjectionService,
} from '../../apps/api/src/finance/spend-projection-service.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { buildExperienceFixture } from '../fixtures/finance/experience.js';
import { experienceId } from '../fixtures/finance/experience.js';
import { createHash } from 'node:crypto';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';
import {
  financeTextGrams,
  financeFactSearchText,
  textPostingKey,
  updateTextPostingBit,
} from '../../apps/api/src/finance/text-postings.js';
function setup() {
  const f = financePersistenceFixture();
  const transaction = buildExperienceFixture().transactions[4]!;
  const fact = createFinanceFact(transaction, {});
  const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
  return { ...f, f, transaction, fact, service };
}
describe('durable Finance contribution publication', () => {
  const dependentFact = (fact: FinanceFact): FinanceFact => ({
    ...fact,
    merchantId: experienceId(7000),
    originalSourceAccountIds: [experienceId(7001)],
    slices: fact.slices.map((slice) => ({
      ...slice,
      budgetItemId: experienceId(7002),
      originalExpenseTransactionId: experienceId(7003),
    })),
  });
  const dependencies = (f: ReturnType<typeof setup>) =>
    [...f.rows.values()].filter((row) => row.PK.startsWith('FINANCE#FACT_DEPENDENCY#'));

  it('publishes at most one atomic batch per bounded step and replays completion without writes', async () => {
    const f = setup();
    let complete = false,
      steps = 0;
    while (!complete && steps++ < 40) {
      const before = f.f.writes;
      complete = await f.service.publishStep(f.fact);
      expect(f.f.writes - before).toBeLessThanOrEqual(1);
      expect(
        f.rows.get(f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${f.fact.accountId}`, SK: 'CURRENT' }))
          ?.coverageVerified,
      ).toBe(false);
    }
    expect(complete).toBe(true);
    expect(steps).toBeGreaterThan(1);
    const before = f.f.writes;
    expect(await f.service.publishStep(f.fact)).toBe(true);
    expect(f.f.writes).toBe(before);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#FACT_ACCOUNT#${f.fact.accountId}`, SK: 'CARDINALITY' }))
        ?.facts,
    ).toBe(1);
  });
  it('resumes failed and lost-response bounded batches without changing contribution totals twice', async () => {
    const f = setup();
    expect(await f.service.publishStep(f.fact)).toBe(false);
    f.f.failAt(f.f.writes + 1);
    await expect(f.service.resumePendingStep(f.fact.id)).rejects.toThrow(/interrupted/i);
    f.f.failAt(-1);
    f.f.loseResponseAt(f.f.writes + 1);
    let complete = false;
    for (let step = 0; step < 40; step++) {
      const before = f.f.writes,
        result = await f.service.resumePendingStep(f.fact.id);
      expect(f.f.writes - before).toBeLessThanOrEqual(1);
      if (result.complete) {
        complete = true;
        break;
      }
    }
    expect(complete).toBe(true);
    expect(await f.service.resumePendingStep(f.fact.id)).toEqual({
      pending: false,
      complete: true,
    });
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(2000);
  });
  it('finishes the saved older bounded input before admitting a newer correction', async () => {
    const f = setup();
    await f.service.publish(f.fact);
    const older = {
      ...f.fact,
      sourceVersion: 2,
      amountMinor: -2500,
      slices: f.fact.slices.map((slice) => ({ ...slice, amountMinor: 2500 })),
    };
    const newer = {
      ...older,
      sourceVersion: 3,
      amountMinor: -3000,
      slices: older.slices.map((slice) => ({ ...slice, amountMinor: 3000 })),
    };
    expect(await f.service.publishStep(older)).toBe(false);
    await expect(f.service.publishStep(newer)).rejects.toThrow(/in progress|rebuilding/i);
    for (let step = 0; step < 40; step++)
      if ((await f.service.resumePendingStep(f.fact.id)).complete) break;
    let complete = false;
    for (let step = 0; step < 40; step++)
      if (await f.service.publishStep(newer)) {
        complete = true;
        break;
      }
    expect(complete).toBe(true);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${f.fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(3000);
  });
  it('preserves the last verified source application and account baseline through a correction', async () => {
    const f = setup();
    await f.service.publish(f.fact);
    const key = { PK: `FINANCE#TRANSACTION#${f.fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    const publication = f.rows.get(f.key(key))!;
    const application = {
      version: 1,
      fingerprint: (publication.data as Record<string, unknown>).fingerprint,
      dependencyScopes: ['FINANCE#CATALOG'],
      originalSourceAccountIds: [],
    };
    (publication.data as Record<string, unknown>).coverageApplication = application;
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${f.fact.accountId}`, SK: 'CURRENT' };
    const baseline = {
      coverageDependencies: { 'FINANCE#CATALOG': 1 },
      coverageDependencyUseCounts: { 'FINANCE#CATALOG': 1 },
      coverageOriginalSourceUseCounts: {},
      incrementalCoverageVersion: 1,
    };
    f.rows.set(f.key(markerKey), {
      ...f.rows.get(f.key(markerKey))!,
      ...baseline,
      state: 'ready',
      coverageVerified: true,
    });
    await f.service.publish({ ...f.fact, sourceVersion: 2, description: 'Corrected' });
    expect((f.rows.get(f.key(key))?.data as Record<string, unknown>).coverageApplication).toEqual(
      application,
    );
    expect(f.rows.get(f.key(markerKey))).toMatchObject({
      ...baseline,
      state: 'awaiting-coverage',
      coverageVerified: false,
    });
  });

  it('retains the verified application during an interrupted correction and its resumed publication', async () => {
    const f = setup();
    await f.service.publish(f.fact);
    const key = { PK: `FINANCE#TRANSACTION#${f.fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    const data = f.rows.get(f.key(key))!.data as Record<string, unknown>;
    const application = {
      version: 1,
      fingerprint: data.fingerprint,
      dependencyScopes: ['FINANCE#CATALOG'],
      originalSourceAccountIds: [],
    };
    data.coverageApplication = application;
    f.f.failAt(f.f.writes + 2);
    await expect(
      f.service.publish({ ...f.fact, sourceVersion: 2, description: 'Interrupted correction' }),
    ).rejects.toThrow(/interrupted/i);
    expect((f.rows.get(f.key(key))?.data as Record<string, unknown>).coverageApplication).toEqual(
      application,
    );
    expect(await f.service.resumePending(f.fact.id)).toBe(true);
    expect((f.rows.get(f.key(key))?.data as Record<string, unknown>).coverageApplication).toEqual(
      application,
    );
    expect(
      f.rows.get(f.key({ PK: `FINANCE#FACT_ACCOUNT#${f.fact.accountId}`, SK: 'CARDINALITY' }))
        ?.facts,
    ).toBe(1);
  });

  it('publishes private merchant, budget-item and original-source references without copying financial content', async () => {
    const f = setup();
    const fact = dependentFact(f.fact);
    await f.service.publish(fact);
    const rows = dependencies(f);
    expect(rows).toHaveLength(4);
    for (const kind of ['merchant', 'budgetItem', 'originalExpense', 'originalAccount'])
      expect(rows.some((row) => row.PK.startsWith(`FINANCE#FACT_DEPENDENCY#${kind}#`))).toBe(true);
    for (const row of rows) {
      expect(row).toMatchObject({ accountId: fact.accountId, transactionId: fact.id });
      expect(row).not.toHaveProperty('amountMinor');
      expect(row).not.toHaveProperty('description');
    }
    expect(
      f.rows.get(f.key({ PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' }))?.data,
    ).toMatchObject({ state: 'complete', dependencyIndexVersion: 1 });
  });

  it('moves and removes dependency references on correction/unlink while preserving another source', async () => {
    const f = setup();
    const fact = dependentFact(f.fact);
    const neighbor = { ...fact, id: experienceId(7999) };
    await f.service.publish(fact);
    await f.service.publish(neighbor);
    const next = {
      ...fact,
      sourceVersion: 2,
      merchantId: experienceId(8000),
      originalSourceAccountIds: [experienceId(8001)],
      slices: fact.slices.map((slice) => ({
        ...slice,
        budgetItemId: experienceId(8002),
        originalExpenseTransactionId: experienceId(8003),
      })),
    };
    await f.service.publish(next);
    expect(dependencies(f)).toHaveLength(8);
    for (const row of dependencies(f).filter((row) => row.transactionId === fact.id))
      expect(row.PK).not.toMatch(/700[0-3]$/);
    const unlinked = { ...next, sourceVersion: 3, slices: [], originalSourceAccountIds: [] };
    delete unlinked.merchantId;
    await f.service.publish(unlinked);
    expect(dependencies(f)).toHaveLength(4);
    expect(dependencies(f).every((row) => row.transactionId === neighbor.id)).toBe(true);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#FACT_ACCOUNT#${fact.accountId}`, SK: 'CARDINALITY' }))?.facts,
    ).toBe(2);
  });

  it('treats unordered DynamoDB maps as the same source when replaying completed or interrupted publications', async () => {
    const f = setup();
    const fact = dependentFact(f.fact);
    await f.service.publish(fact);
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === 'object' && !(value instanceof Uint8Array)
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, item]) => [key, reorder(item)]),
            )
          : value;
    const writes = f.f.writes;
    await f.service.publish(reorder(fact) as FinanceFact);
    expect(f.f.writes).toBe(writes);
    const next = {
      ...fact,
      sourceVersion: 2,
      description: 'A corrected synthetic description with many reusable tokens',
    };
    f.f.failAt(f.f.writes + 2);
    await expect(f.service.publish(next)).rejects.toThrow(/interrupted/i);
    const get = f.persistence.get;
    f.persistence.get = async (key) => reorder(await get(key)) as Awaited<ReturnType<typeof get>>;
    let upgraded = false;
    for (let step = 0; step < 80; step++) {
      const before = f.f.writes,
        resumed = await f.service.resumePendingStep(fact.id);
      if (!resumed.pending && (await f.service.publishStep(next))) upgraded = true;
      expect(f.f.writes - before).toBeLessThanOrEqual(1);
      if (upgraded) break;
    }
    expect(upgraded).toBe(true);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' }))?.data,
    ).toMatchObject({ state: 'complete', dependencyIndexVersion: 1 });
  });

  it('upgrades a completed v2 contribution to dependency references without duplicating its source count or totals', async () => {
    const f = setup();
    const fact = dependentFact(f.fact);
    await f.service.publish(fact);
    for (const row of dependencies(f)) f.rows.delete(f.key(row));
    const key = { PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    const checkpoint = f.rows.get(f.key(key))!.data as Record<string, unknown>;
    delete checkpoint.dependencyIndexVersion;
    checkpoint.fingerprint = createHash('sha256')
      .update(JSON.stringify({ next: fact, calendarBasis: 'UTC', textPostingVersion: 2 }))
      .digest('hex');
    await f.service.publish(fact);
    expect(dependencies(f)).toHaveLength(4);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#FACT_ACCOUNT#${fact.accountId}`, SK: 'CARDINALITY' }))?.facts,
    ).toBe(1);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(2000);
    const current = structuredClone(f.rows.get(f.key(key))!);
    const writes = f.f.writes;
    for (const format of [{ dependencyIndexVersion: 2 }, { textPostingVersion: 3 }]) {
      f.rows.set(f.key(key), { ...current, data: { ...(current.data as object), ...format } });
      await expect(f.service.publish(fact)).rejects.toThrow(/unsupported|upgrade|format/i);
      expect(f.f.writes).toBe(writes);
    }
  });

  it('finishes a durable v2 offset with its old operation list before adding dependency references', async () => {
    const f = setup();
    const fact = {
      ...dependentFact(f.fact),
      description:
        'apple orchard purchase with synthetic alphabetized tokens for older resumable publication',
    };
    const next = { ...fact, textMonth: '2026-10', textOrdinal: 0 };
    const refs = financeFactReferences(next, false, false);
    const postings = financeTextGrams(financeFactSearchText(next), 1, 3).map((gram) => ({
      ...textPostingKey(next.accountId, gram, '2026-10', 0),
      codec: 'text-bitmap-v2',
      month: '2026-10',
      baseOrdinal: 0,
      bits: updateTextPostingBit(new Uint8Array(63), 0, true),
    }));
    const oldOperations = [...refs, ...postings];
    expect(oldOperations.length).toBeGreaterThan(40);
    for (const row of oldOperations.slice(0, 40)) {
      f.rows.set(f.key(row), row);
      const counter = { PK: row.PK, SK: 'CARDINALITY' };
      f.rows.set(f.key(counter), { ...counter, facts: 1 });
    }
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ next: fact, calendarBasis: 'UTC', textPostingVersion: 2 }))
      .digest('hex');
    const key = { PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    f.rows.set(f.key(key), {
      ...key,
      data: {
        operation: fingerprint,
        fingerprint,
        state: 'rebuilding',
        offset: 40,
        next,
        textPostingVersion: 2,
        calendarBasis: 'UTC',
      },
    });
    const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${fact.accountId}`, SK: 'CURRENT' };
    f.rows.set(f.key(marker), {
      ...marker,
      operation: fingerprint,
      state: 'rebuilding',
      revision: 1,
    });
    const ordinal = { PK: `FINANCE#TEXT_ORDINAL#${fact.accountId}#2026-10`, SK: 'CURRENT' };
    f.rows.set(f.key(ordinal), { ...ordinal, nextOrdinal: 1 });
    let upgraded = false;
    for (let step = 0; step < 80; step++) {
      const before = f.f.writes,
        resumed = await f.service.resumePendingStep(fact.id);
      if (!resumed.pending && (await f.service.publishStep(fact))) upgraded = true;
      expect(f.f.writes - before).toBeLessThanOrEqual(1);
      if (upgraded) break;
    }
    expect(upgraded).toBe(true);
    expect(dependencies(f)).toHaveLength(4);
    for (const row of [...refs, ...postings]) expect(f.rows.has(f.key(row))).toBe(true);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#FACT_ACCOUNT#${fact.accountId}`, SK: 'CARDINALITY' }))?.facts,
    ).toBe(1);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(2000);
  });
  it('updates compact account aggregates atomically when a correction keeps the same index key', async () => {
    const { f, fact, service } = setup();
    await service.publish(fact);
    const reference = financeFactReferences(fact).find(
      (row) => row.PK === `FINANCE#FACT_ACCOUNT#${fact.accountId}`,
    )!;
    expect(f.rows.get(f.key(reference))?.aggregate).toMatchObject({
      version: 1,
      sourceVersion: 1,
      active: true,
      totals: [{ amountMinor: 2000 }],
    });
    const next = {
      ...fact,
      sourceVersion: 2,
      originalSourceAccountIds: ['original'],
      slices: fact.slices.map((slice) => ({ ...slice, amountMinor: -75, budgetId: 'budget' })),
    };
    await service.publish(next);
    expect(f.rows.get(f.key(reference))?.aggregate).toMatchObject({
      sourceVersion: 2,
      totals: [{ amountMinor: -75 }],
      originalSourceAccountIds: ['original'],
      budgetIds: ['budget'],
    });
    await service.publish({ ...next, sourceVersion: 3, sourceStatus: 'archived' });
    expect(f.rows.get(f.key(reference))?.aggregate).toMatchObject({
      sourceVersion: 3,
      active: false,
    });
  });

  it('keeps prior compact state hidden by rebuilding coverage until an interrupted correction commits', async () => {
    const { f, fact, service } = setup();
    await service.publish(fact);
    const reference = financeFactReferences(fact).find(
      (row) => row.PK === `FINANCE#FACT_ACCOUNT#${fact.accountId}`,
    )!;
    f.failAt(f.writes + 2);
    const next = {
      ...fact,
      sourceVersion: 2,
      description: `${fact.description} revised`,
      slices: [],
    };
    await expect(service.publish(next)).rejects.toThrow(/interrupted/i);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#PROJECTION_ACCOUNT#${fact.accountId}`, SK: 'CURRENT' }))
        ?.state,
    ).toBe('rebuilding');
    expect(f.rows.get(f.key(reference))?.aggregate).toMatchObject({ sourceVersion: 1 });
    expect(await service.resumePending(fact.id)).toBe(true);
    expect(f.rows.get(f.key(reference))?.aggregate).toMatchObject({
      sourceVersion: 2,
      hasSpend: false,
      totals: [],
    });
    const writes = f.writes;
    await service.publish(next);
    expect(f.writes).toBe(writes);
  });
  it('resumes an interrupted reference batch and publishes totals exactly once', async () => {
    const { f, fact, service } = setup();
    f.failAt(3);
    await expect(service.publish(fact)).rejects.toThrow(/interrupted/i);
    const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${fact.accountId}`, SK: 'CURRENT' };
    expect(f.rows.get(f.key(marker))?.state).toBe('rebuilding');
    expect(await service.resumePending(fact.id)).toBe(true);
    for (const reference of financeFactReferences(fact))
      expect(f.rows.has(f.key(reference))).toBe(true);
    const summary = { PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' };
    expect(f.rows.get(f.key(summary))?.amountMinor).toBe(2_000);
    const writes = f.writes;
    await service.publish(fact);
    expect(f.writes).toBe(writes);
    expect(f.rows.get(f.key(marker))).toMatchObject({
      state: 'awaiting-coverage',
      coverageVerified: false,
    });
  });

  it('reverses old month/index contributions on a corrected source date and amount', async () => {
    const { f, fact, service } = setup();
    await service.publish(fact);
    const next = {
      ...fact,
      sourceVersion: 2,
      effectiveAt: '2026-11-02T12:00:00.000Z',
      amountMinor: -1_500,
      slices: fact.slices.map((s) => ({
        ...s,
        amountMinor: 1_500,
        effectiveAt: '2026-11-02T12:00:00.000Z',
      })),
    };
    await service.publish(next);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' }))
        ?.amountMinor,
    ).toBe(0);
    expect(
      f.rows.get(f.key({ PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-11' }))
        ?.amountMinor,
    ).toBe(1_500);
    for (const old of financeFactReferences(fact, false, false))
      expect(f.rows.has(f.key(old))).toBe(false);
  });

  it('rejects a competing publication during rebuilding and stale source versions after publication', async () => {
    const { f, fact, service } = setup();
    f.failAt(2);
    await expect(service.publish(fact)).rejects.toThrow(/interrupted/i);
    await expect(service.publish({ ...fact, sourceVersion: 2 })).rejects.toThrow(
      /in progress|rebuilding/i,
    );
    await service.publish(fact);
    await service.publish({ ...fact, sourceVersion: 2 });
    await expect(service.publish(fact)).rejects.toThrow(/source conflict/i);
  });

  it('reverses the previous calendar basis before publishing a different local month', async () => {
    const { f, fact, service } = setup();
    const boundary = {
      ...fact,
      effectiveAt: '2026-11-01T00:30:00.000Z',
      slices: fact.slices.map((slice) => ({ ...slice, effectiveAt: '2026-11-01T00:30:00.000Z' })),
    };
    await service.publish(boundary, 'UTC');
    await service.publish(boundary, 'America/Denver');
    const summary = (basis: string, month: string) =>
      f.rows.get(
        f.key({
          PK: `FINANCE#SUMMARY#${fact.accountId}#USD`,
          SK: `MONTH#${basis}#${month}`,
        }),
      )?.amountMinor;
    expect(summary('UTC', '2026-11')).toBe(0);
    expect(summary('America/Denver', '2026-10')).toBe(2_000);
    const completed = f.rows.get(
      f.key({ PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' }),
    )!.data;
    expect(completed).not.toHaveProperty('previous');
    expect(completed).not.toHaveProperty('next');
    const writes = f.writes;
    await service.publish(boundary, 'America/Denver');
    expect(f.writes).toBe(writes);
    await service.publish(boundary, 'UTC');
    expect(summary('UTC', '2026-11')).toBe(2_000);
    expect(summary('America/Denver', '2026-10')).toBe(0);
  });

  it('retains the original calendar basis across an interrupted correction', async () => {
    const { f, fact, service } = setup();
    await service.publish(fact, 'UTC');
    f.failAt(f.writes + 2);
    await expect(service.publish(fact, 'America/Denver')).rejects.toThrow(/interrupted/i);
    await service.publish(fact, 'America/Denver');
    const amount = (basis: string) =>
      f.rows.get(
        f.key({
          PK: `FINANCE#SUMMARY#${fact.accountId}#USD`,
          SK: `MONTH#${basis}#2026-10`,
        }),
      )?.amountMinor;
    expect(amount('UTC')).toBe(0);
    expect(amount('America/Denver')).toBe(2_000);
  });

  it('treats a legacy checkpoint without a calendar basis as UTC when correcting it', async () => {
    const { f, fact, service } = setup();
    await service.publish(fact, 'UTC');
    const checkpoint = f.rows.get(
      f.key({
        PK: `FINANCE#TRANSACTION#${fact.id}`,
        SK: 'SPEND_CONTRIBUTION',
      }),
    )!.data as Record<string, unknown>;
    delete checkpoint.calendarBasis;
    await service.publish({ ...fact, sourceVersion: 2 }, 'America/Denver');
    expect(
      f.rows.get(
        f.key({
          PK: `FINANCE#SUMMARY#${fact.accountId}#USD`,
          SK: 'MONTH#UTC#2026-10',
        }),
      )?.amountMinor,
    ).toBe(0);
    expect(
      f.rows.get(
        f.key({
          PK: `FINANCE#SUMMARY#${fact.accountId}#USD`,
          SK: 'MONTH#America/Denver#2026-10',
        }),
      )?.amountMinor,
    ).toBe(2_000);
  });
});
