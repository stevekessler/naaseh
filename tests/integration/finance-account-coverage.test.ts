import { initializeFinanceProjectionAccount } from '../../apps/api/src/finance/account-publication-bootstrap.js';
import { SpendProjectionService } from '../../apps/api/src/finance/spend-projection-service.js';
import {
  describeFinanceCanonicalChange,
  financePublicationJournalRecords,
} from '../../apps/api/src/finance/publication-change-journal.js';
import { FinanceIncrementalCoverageService } from '../../apps/api/src/finance/incremental-coverage-service.js';
import { describe, expect, it } from 'vitest';
import { FinanceAccountCoverageVerifier } from '../../apps/api/src/finance/account-coverage-service.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import type { FinanceFact } from '../../apps/api/src/finance/query-contract.js';
import { experienceId } from '../fixtures/finance/experience.js';
import { createFinanceAccountReadSummary } from '../../apps/api/src/finance/account-read-summary.js';
import { financePublicationFingerprint } from '../../apps/api/src/finance/source-dependency-index.js';

function setup(size = 3, extraDependencyCount = 0, pageSize = 2) {
  const f = financePersistenceFixture();
  const PK = 'FINANCE#SCOPE#OWNER#u1';
  const accountId = 'account';
  const accountKey = { PK, SK: 'ROW#accounts#account' };
  f.rows.set(f.key(financeLocatorKey('accounts', accountId)), {
    ...financeLocatorKey('accounts', accountId),
    storageKey: accountKey,
  });
  f.rows.set(f.key(accountKey), {
    ...accountKey,
    collection: 'accounts',
    entryKey: accountId,
    data: { id: accountId },
  });
  const meta = { PK, SK: 'META' };
  f.rows.set(f.key(meta), { ...meta, revision: 1 });
  const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
  f.rows.set(f.key(marker), {
    ...marker,
    state: 'awaiting-coverage',
    coverageVerified: false,
    revision: 1,
  });
  const rows = Array.from({ length: size }, (_, index) => {
    const fact: FinanceFact = {
      id: `t${index}`,
      accountId,
      effectiveAt: '2026-10-01T00:00:00.000Z',
      sourceVersion: 1,
      currency: 'USD',
      currencyExponent: 2,
      amountMinor: -100,
      description: 'Synthetic',
      slices: [],
    };
    const row = {
      PK,
      SK: `ROW#transactions#${index}`,
      collection: 'transactions',
      entryKey: fact.id,
      data: { ...fact, version: 1 },
    };
    const key = { PK: `FINANCE#FACT#${fact.id}`, SK: 'CURRENT' };
    f.rows.set(f.key(key), { ...key, fact });
    const publication = { PK: `FINANCE#TRANSACTION#${fact.id}`, SK: 'SPEND_CONTRIBUTION' };
    f.rows.set(f.key(publication), {
      ...publication,
      data: {
        state: 'complete',
        dependencyIndexVersion: 1,
        textPostingVersion: 2,
        calendarBasis: 'UTC',
        fingerprint: financePublicationFingerprint(fact, 'UTC'),
      },
    });
    const reference = {
      PK: `FINANCE#FACT_ACCOUNT#${accountId}`,
      SK: `DATE#${fact.effectiveAt}#${fact.id}`,
    };
    f.rows.set(f.key(reference), { ...reference, transactionId: fact.id });
    return row;
  });
  const cardinality = { PK: `FINANCE#FACT_ACCOUNT#${accountId}`, SK: 'CARDINALITY' };
  f.rows.set(f.key(cardinality), { ...cardinality, facts: size });
  const catalog = { PK: 'FINANCE#CATALOG', SK: 'META' };
  f.rows.set(f.key(catalog), { ...catalog, revision: 1 });
  const extraDependencies: Record<string, number> = {};
  for (let i = 0; i < extraDependencyCount; i++) {
    const key = { PK: `FINANCE#SCOPE#GROUP#g${i}`, SK: 'META' };
    f.rows.set(f.key(key), { ...key, revision: 1 });
    extraDependencies[key.PK] = 1;
  }
  const requested: number[] = [];
  const service = new FinanceAccountCoverageVerifier({
    work: () => new FinanceUnitOfWork(f.persistence, 'table'),
    readPage: async (_partition, cursor, limit) => {
      requested.push(limit);
      const offset = cursor ? Number(cursor.SK.split('#').at(-1)) + 1 : 0;
      const page = rows.slice(offset, offset + limit);
      return {
        rows: page,
        ...(offset + page.length < rows.length ? { nextKey: { PK, SK: page.at(-1)!.SK } } : {}),
      };
    },
    expectedFact: async (row) => ({
      fact: { ...rows.find((value) => value.entryKey === row.entryKey)!.data, version: undefined },
      dependencies: {
        [PK]: Number(f.rows.get(f.key(meta))?.revision),
        'FINANCE#CATALOG': Number(f.rows.get(f.key(catalog))?.revision),
        ...extraDependencies,
      },
    }),
    pageSize,
  });
  return {
    ...f,
    get writes() {
      return f.writes;
    },
    service,
    accountId,
    marker,
    meta,
    canonicalRows: rows,
    catalog,
    requested,
  };
}
async function finishCoverage(f: ReturnType<typeof setup>) {
  for (let step = 0; step < 20; step++) {
    const result = await f.service.step(f.accountId);
    if (result.complete) return result;
  }
  throw new Error('Coverage did not finish within its bounded stages');
}
const enrolled = (f: ReturnType<typeof setup>) =>
  [...f.rows.values()].filter((row) => row.PK.startsWith('FINANCE#PROJECTION_DEPENDENCY#'));
describe('bounded canonical account coverage proof', () => {
  it('saves per-source applied fingerprints and counts each verified dependency once across pages and restart', async () => {
    const f = setup(3);
    await f.service.step(f.accountId);
    await finishCoverage(f);
    const marker = f.rows.get(f.key(f.marker))!;
    expect(marker.incrementalCoverageVersion).toBe(1);
    expect(marker.coverageDependencyUseCounts).toEqual({ [f.meta.PK]: 3, 'FINANCE#CATALOG': 3 });
    expect(marker.coverageOriginalSourceUseCounts).toEqual({});
    for (const row of f.canonicalRows) {
      const publication = f.rows.get(
        f.key({ PK: `FINANCE#TRANSACTION#${row.entryKey}`, SK: 'SPEND_CONTRIBUTION' }),
      )!.data as Record<string, unknown>;
      expect(publication.coverageApplication).toEqual({
        version: 1,
        generation: marker.coverageGeneration,
        fingerprint: publication.fingerprint,
        dependencyScopes: ['FINANCE#CATALOG', f.meta.PK].sort(),
        originalSourceAccountIds: [],
      });
    }
    await f.service.step(f.accountId, { restart: true });
    await finishCoverage(f);
    expect(f.rows.get(f.key(f.marker))?.coverageDependencyUseCounts).toEqual(
      marker.coverageDependencyUseCounts,
    );
  });

  it('requires a trusted restart for a saved proof without incremental coverage inputs', async () => {
    const f = setup(3);
    await f.service.step(f.accountId);
    const row = f.rows.get(f.key({ ...f.marker, SK: 'COVERAGE_CHECKPOINT' }))!;
    delete (row.data as Record<string, unknown>).incrementalCoverageVersion;
    await expect(f.service.step(f.accountId)).rejects.toThrow(/restart|revision/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
  });

  it('rejects malformed saved dependency counts before publishing coverage', async () => {
    const f = setup(3);
    await f.service.step(f.accountId);
    const row = f.rows.get(f.key({ ...f.marker, SK: 'COVERAGE_CHECKPOINT' }))!;
    (row.data as Record<string, unknown>).dependencyUseCounts = { [f.meta.PK]: -1 };
    await expect(f.service.step(f.accountId)).rejects.toThrow(/invariant|count/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
  });

  it('registers all canonical dependency scopes before certifying account readiness', async () => {
    const f = setup(1);
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: false, verified: 1 });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await finishCoverage(f)).toMatchObject({ complete: true, verified: 1 });
    expect(
      enrolled(f)
        .map((row) => row.dependencyScope)
        .sort(),
    ).toEqual(['FINANCE#CATALOG', f.meta.PK]);
    expect(enrolled(f).every((row) => row.accountId === f.accountId)).toBe(true);
    expect(f.rows.get(f.key(f.marker))?.coverageDependencyRegistryVersion).toBe(1);
  });

  it('enrolls an 80-scope graph in batches of ten without exceeding the atomic touched-record limit', async () => {
    const f = setup(5, 78, 5);
    await f.service.step(f.accountId);
    let previous = 0;
    for (let step = 0; step < 10; step++) {
      const result = await f.service.step(f.accountId);
      expect(enrolled(f).length - previous).toBeLessThanOrEqual(10);
      previous = enrolled(f).length;
      if (result.complete) break;
      expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    }
    expect(enrolled(f)).toHaveLength(80);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
  });

  it('keeps interrupted enrollment unavailable and restarts safely when an earlier registered source changes', async () => {
    const f = setup(1, 18);
    await f.service.step(f.accountId);
    await f.service.step(f.accountId);
    expect(enrolled(f)).toHaveLength(10);
    f.failAt(f.writes + 1);
    await expect(f.service.step(f.accountId)).rejects.toThrow(/interrupted/i);
    expect(enrolled(f)).toHaveLength(10);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    f.rows.set(f.key(f.catalog), { ...f.catalog, revision: 2 });
    await expect(f.service.step(f.accountId)).rejects.toThrow(/revision|restart/i);
    await f.service.step(f.accountId, { restart: true });
    await finishCoverage(f);
    expect(enrolled(f)).toHaveLength(20);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageDependencies: { 'FINANCE#CATALOG': 2 },
    });
  });

  it('rejects a conflicting dependency identity instead of overwriting it or marking coverage ready', async () => {
    const f = setup(1);
    await f.service.step(f.accountId);
    await finishCoverage(f);
    const entry = enrolled(f)[0]!;
    f.rows.set(f.key(entry), { ...entry, accountId: 'another-account' });
    await f.service.step(f.accountId, { restart: true });
    await expect(finishCoverage(f)).rejects.toThrow(/dependency|registry|identity/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(f.rows.get(f.key(entry))?.accountId).toBe('another-account');
  });

  it('recovers a lost enrollment response and competing verifier without duplicate directory entries', async () => {
    const f = setup(1);
    await f.service.step(f.accountId);
    f.loseResponseAt(f.writes + 1);
    const results = await Promise.all([f.service.step(f.accountId), f.service.step(f.accountId)]);
    expect(results.every((result) => result.complete)).toBe(true);
    expect(enrolled(f)).toHaveLength(2);
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: true, verified: 1 });
    expect(f.requested).toEqual([2]);
  });
  it('certifies ordered compact references only when every canonical row has matching normalized index input', async () => {
    for (const legacy of [false, true]) {
      const f = setup(3);
      for (const row of f.canonicalRows) {
        const fact = f.rows.get(f.key({ PK: `FINANCE#FACT#${row.entryKey}`, SK: 'CURRENT' }))!
          .fact as FinanceFact;
        const key = {
          PK: `FINANCE#FACT_ACCOUNT#${f.accountId}`,
          SK: `DATE#${fact.effectiveAt}#${fact.id}`,
        };
        f.rows.set(f.key(key), {
          ...key,
          transactionId: fact.id,
          ...(!legacy ? { aggregate: createFinanceAccountReadSummary(fact) } : {}),
        });
      }
      await f.service.step(f.accountId);
      await finishCoverage(f);
      expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
      expect(f.rows.get(f.key(f.marker))?.accountIndexOrderVersion).toBe(legacy ? undefined : 1);
    }
  });
  it('accumulates original-source accounts across verified pages and requires restart for older incomplete proofs', async () => {
    const f = setup(3);
    for (const [index, row] of f.canonicalRows.entries()) {
      row.data.originalSourceAccountIds = [experienceId(index === 2 ? 5000 : 5001)];
      const key = { PK: `FINANCE#FACT#${row.entryKey}`, SK: 'CURRENT' };
      f.rows.set(f.key(key), { ...key, fact: { ...row.data, version: undefined } });
      const contribution = f.rows.get(
        f.key({ PK: `FINANCE#TRANSACTION#${row.entryKey}`, SK: 'SPEND_CONTRIBUTION' }),
      )!;
      (contribution.data as Record<string, unknown>).fingerprint = financePublicationFingerprint(
        { ...row.data, version: undefined } as FinanceFact,
        'UTC',
      );
    }
    await f.service.step(f.accountId);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    await finishCoverage(f);
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      sourceAccountProofVersion: 1,
      originalSourceAccountIds: [experienceId(5000), experienceId(5001)],
    });
    const checkpoint = f.rows.get(f.key({ ...f.marker, SK: 'COVERAGE_CHECKPOINT' }))!;
    delete (checkpoint.data as Record<string, unknown>).sourceAccountProofVersion;
    await expect(f.service.step(f.accountId)).rejects.toThrow(/restart|revision/i);
    await f.service.step(f.accountId, { restart: true });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await finishCoverage(f)).toMatchObject({ complete: true, verified: 3 });
  });
  it('resumes pages without certifying a partial canonical scope', async () => {
    const f = setup();
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: false, verified: 2 });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: false, verified: 3 });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await finishCoverage(f)).toMatchObject({ complete: true, verified: 3 });
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      state: 'ready',
      coverageVerified: true,
      sourceScopeRevision: 1,
    });
    expect(f.requested).toEqual([2, 2]);
  });
  it('never certifies a missing or mismatched canonical projection', async () => {
    const f = setup(1);
    f.rows.delete(f.key({ PK: 'FINANCE#FACT#t0', SK: 'CURRENT' }));
    await expect(f.service.step(f.accountId)).rejects.toThrow(/projection|source/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    const missingIndex = setup(1);
    const row = missingIndex.canonicalRows[0]!;
    missingIndex.rows.delete(
      missingIndex.key({
        PK: `FINANCE#FACT_ACCOUNT#${missingIndex.accountId}`,
        SK: `DATE#${row.data.effectiveAt}#${row.entryKey}`,
      }),
    );
    await expect(missingIndex.service.step(missingIndex.accountId)).rejects.toThrow(
      /index|reference|projection/i,
    );
    const staleIndex = setup(1);
    const fact = staleIndex.canonicalRows[0]!.data;
    const key = {
      PK: `FINANCE#FACT_ACCOUNT#${staleIndex.accountId}`,
      SK: `DATE#${fact.effectiveAt}#${fact.id}`,
    };
    staleIndex.rows.set(staleIndex.key(key), {
      ...key,
      transactionId: fact.id,
      aggregate: { ...createFinanceAccountReadSummary(fact), active: false },
    });
    await expect(staleIndex.service.step(staleIndex.accountId)).rejects.toThrow(
      /aggregate|index|canonical/i,
    );
    const oldPublication = setup(1);
    oldPublication.rows.delete(
      oldPublication.key({ PK: 'FINANCE#TRANSACTION#t0', SK: 'SPEND_CONTRIBUTION' }),
    );
    await expect(oldPublication.service.step(oldPublication.accountId)).rejects.toThrow(
      /dependency|publication|upgrade/i,
    );
    const stalePublication = setup(1);
    const contribution = stalePublication.rows.get(
      stalePublication.key({ PK: 'FINANCE#TRANSACTION#t0', SK: 'SPEND_CONTRIBUTION' }),
    )!;
    (contribution.data as Record<string, unknown>).fingerprint = 'older-canonical-body';
    await expect(stalePublication.service.step(stalePublication.accountId)).rejects.toThrow(
      /canonical|publication|dependency/i,
    );
  });
  it('rejects a scope revision change between verification pages', async () => {
    const f = setup();
    await f.service.step(f.accountId);
    f.rows.set(f.key(f.meta), { ...f.meta, revision: 2 });
    await expect(f.service.step(f.accountId)).rejects.toThrow(/revision|restart/i);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await f.service.step(f.accountId, { restart: true })).toMatchObject({
      complete: false,
      verified: 2,
    });
    expect(await finishCoverage(f)).toMatchObject({ complete: true, verified: 3 });
    const g = setup(1);
    await finishCoverage(g);
    const catalog = { PK: 'FINANCE#CATALOG', SK: 'META' };
    g.rows.set(g.key(catalog), { ...catalog, revision: 2 });
    await expect(g.service.step(g.accountId)).rejects.toThrow(/revision|restart/i);
  });
  it('certifies empty scope only after canonical enumeration and exact cardinality reconciliation', async () => {
    const f = setup(0);
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: false, verified: 0 });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await finishCoverage(f)).toMatchObject({ complete: true, verified: 0 });
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageDependencies: { 'FINANCE#SCOPE#OWNER#u1': 1 },
    });
    const g = setup(0);
    const key = { PK: `FINANCE#FACT_ACCOUNT#${g.accountId}`, SK: 'CARDINALITY' };
    g.rows.set(g.key(key), { ...key, facts: 1 });
    await expect(finishCoverage(g)).rejects.toThrow(/cardinality|projection/i);
    expect(g.rows.get(g.key(g.marker))?.coverageVerified).toBe(false);
  });
});

describe('atomic per-source incremental coverage application', () => {
  async function incremental(size = 3) {
    const f = setup(size);
    await f.service.step(f.accountId);
    await finishCoverage(f);
    let dependencies: Record<string, number> = { [f.meta.PK]: 1, 'FINANCE#CATALOG': 1 };
    let beforeWrite: (() => void) | undefined;
    const work = () =>
      new FinanceUnitOfWork(
        {
          ...f.persistence,
          write: async (items) => {
            beforeWrite?.();
            await f.persistence.write(items);
          },
        },
        'table',
      );
    const service = new FinanceIncrementalCoverageService({
      work,
      resolve: async (id) => {
        const row = f.canonicalRows.find((row) => row.entryKey === id)!;
        return {
          fact: { ...row.data, version: undefined },
          dependencies,
          sourceKey: { PK: row.PK, SK: row.SK },
        };
      },
    });
    const correct = (index = 0, originalSourceAccountIds: string[] = []) => {
      const row = f.canonicalRows[index]!;
      row.data = {
        ...row.data,
        description: 'Corrected source',
        sourceVersion: 2,
        originalSourceAccountIds,
      } as typeof row.data;
      const fact = { ...row.data, version: undefined };
      const key = { PK: `FINANCE#FACT#${row.entryKey}`, SK: 'CURRENT' };
      f.rows.set(f.key(key), { ...key, fact });
      const publication = f.rows.get(
        f.key({ PK: `FINANCE#TRANSACTION#${row.entryKey}`, SK: 'SPEND_CONTRIBUTION' }),
      )!.data as Record<string, unknown>;
      publication.fingerprint = financePublicationFingerprint(fact, 'UTC');
      return row.entryKey;
    };
    const create = async (ordinal = 0) => {
      const fact: FinanceFact = {
        id: experienceId(9100 + ordinal),
        accountId: f.accountId,
        effectiveAt: '2026-11-06T12:00:00.000Z',
        amountMinor: -100,
        currency: 'USD',
        currencyExponent: 2,
        sourceVersion: 1,
        sourceStatus: 'active',
        description: 'New synthetic expense',
        slices: [],
      };
      const row = {
        PK: f.meta.PK,
        SK: `ROW#transactions#${fact.id}`,
        collection: 'transactions',
        entryKey: fact.id,
        data: { ...fact, version: 1 },
      };
      f.canonicalRows.push(row);
      const beforeRevision = Number(f.rows.get(f.key(f.meta))!.revision);
      const afterRevision = beforeRevision + 1;
      f.rows.get(f.key(f.meta))!.revision = afterRevision;
      dependencies = { ...dependencies, [f.meta.PK]: afterRevision };
      const records = financePublicationJournalRecords(
        [describeFinanceCanonicalChange(row, undefined, row)!],
        [{ PK: f.meta.PK, beforeRevision, afterRevision }],
      );
      for (const record of records) f.rows.set(f.key(record), record);
      await new SpendProjectionService(work).publish(fact);
      return { id: fact.id, publicationId: records[0]!.id as string };
    };
    return {
      ...f,
      service,
      correct,
      create,
      get writes() {
        return f.writes;
      },
      setDependencies(next: Record<string, number>) {
        dependencies = next;
      },
      beforeWrite(callback: () => void) {
        beforeWrite = callback;
      },
    };
  }

  it('replaces one source dependency set and prunes a scope only after its last use', async () => {
    const f = await incremental();
    const group = 'FINANCE#SCOPE#GROUP#new';
    f.rows.set(f.key({ PK: group, SK: 'META' }), { PK: group, SK: 'META', revision: 1 });
    f.setDependencies({ [f.meta.PK]: 1, [group]: 1 });
    const original = experienceId(9000);
    await f.service.applyPublishedSource(f.correct(0, [original]));
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      state: 'awaiting-coverage',
      coverageVerified: false,
      coverageDependencyUseCounts: { [f.meta.PK]: 3, 'FINANCE#CATALOG': 2, [group]: 1 },
      coverageOriginalSourceUseCounts: { [original]: 1 },
      originalSourceAccountIds: [original],
    });
    await f.service.applyPublishedSource(f.correct(1));
    await f.service.applyPublishedSource(f.correct(2));
    expect(f.rows.get(f.key(f.marker))?.coverageDependencyUseCounts).toEqual({
      [f.meta.PK]: 3,
      [group]: 3,
    });
    // A second application can remove the original account without affecting other sources.
    await f.service.applyPublishedSource(f.correct(0));
    expect(f.rows.get(f.key(f.marker))?.originalSourceAccountIds).toEqual([]);
    expect(f.rows.get(f.key(f.marker))?.coverageSourceCount).toBe(3);
    expect(f.rows.get(f.key(f.marker))?.coverageDependencies).toEqual({
      [f.meta.PK]: 1,
      'FINANCE#CATALOG': 1,
    });
  });

  it('replays a lost response without applying the same source twice', async () => {
    const f = await incremental();
    const id = f.correct(0, [experienceId(9000)]);
    f.loseResponseAt(f.writes + 1);
    await expect(f.service.applyPublishedSource(id)).resolves.toEqual({ applied: true });
    const writes = f.writes;
    expect(await f.service.applyPublishedSource(id)).toEqual({ applied: false });
    expect(f.writes).toBe(writes);
    expect(f.rows.get(f.key(f.marker))?.coverageOriginalSourceUseCounts).toEqual({
      [experienceId(9000)]: 1,
    });
  });

  it('rejects a missing or different-generation application instead of guessing a delta', async () => {
    const f = await incremental();
    const id = f.correct();
    const data = f.rows.get(f.key({ PK: `FINANCE#TRANSACTION#${id}`, SK: 'SPEND_CONTRIBUTION' }))!
      .data as Record<string, unknown>;
    const application = structuredClone(data.coverageApplication) as Record<string, unknown>;
    const writes = f.writes;
    for (const value of [undefined, { ...application, generation: 'f'.repeat(64) }]) {
      data.coverageApplication = value;
      await expect(f.service.applyPublishedSource(id)).rejects.toThrow(
        /baseline|generation|coverage/i,
      );
      expect(f.writes).toBe(writes);
    }
  });

  it('conditions the current canonical graph before atomically changing counts', async () => {
    const f = await incremental();
    const id = f.correct();
    const writes = f.writes;
    const baseline = structuredClone(f.rows.get(f.key(f.marker))!);
    f.beforeWrite(() => {
      f.rows.get(f.key(f.meta))!.revision = 2;
    });
    await expect(f.service.applyPublishedSource(id)).rejects.toThrow(/conflict/i);
    expect(f.writes).toBe(writes + 1);
    expect(f.rows.get(f.key(f.marker))).toEqual(baseline);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(true);
  });

  it('does not change counts for an incomplete publication or an interrupted transaction', async () => {
    const f = await incremental();
    const id = f.correct(0, [experienceId(9000)]);
    const data = f.rows.get(f.key({ PK: `FINANCE#TRANSACTION#${id}`, SK: 'SPEND_CONTRIBUTION' }))!
      .data as Record<string, unknown>;
    const baseline = structuredClone(f.rows.get(f.key(f.marker))!);
    data.state = 'rebuilding';
    await expect(f.service.applyPublishedSource(id)).rejects.toThrow(/publication|complete/i);
    expect(f.rows.get(f.key(f.marker))).toEqual(baseline);
    data.state = 'complete';
    f.failAt(f.writes + 1);
    await expect(f.service.applyPublishedSource(id)).rejects.toThrow(/interrupted/i);
    expect(f.rows.get(f.key(f.marker))).toEqual(baseline);
    await f.service.applyPublishedSource(id);
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
  });
  it('enrolls a proven newly created source into an empty verified account without a rebuild', async () => {
    const f = await incremental(0);
    const source = await f.create();
    expect(
      await f.service.applyPublishedSource(source.id, {
        creationPublicationId: source.publicationId,
      }),
    ).toEqual({ applied: true });
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 1,
      coverageDependencyUseCounts: { [f.meta.PK]: 1, 'FINANCE#CATALOG': 1 },
      state: 'awaiting-coverage',
      coverageVerified: false,
    });
  });

  it('rejects missing, stale and mismatched creation evidence without adding a source', async () => {
    const f = await incremental(0);
    const source = await f.create();
    const writes = f.writes;
    await expect(f.service.applyPublishedSource(source.id)).rejects.toThrow(
      /baseline|creation|coverage/i,
    );
    await expect(
      f.service.applyPublishedSource(source.id, { creationPublicationId: 'f'.repeat(64) }),
    ).rejects.toThrow(/manifest|creation/i);
    f.rows.get(f.key(f.marker))!.coverageDependencies = { [f.meta.PK]: 2 };
    await expect(
      f.service.applyPublishedSource(source.id, { creationPublicationId: source.publicationId }),
    ).rejects.toThrow(/creation|baseline/i);
    expect(f.writes).toBe(writes);
    expect(f.rows.get(f.key(f.marker))?.coverageSourceCount).toBe(0);
  });

  it('never treats an old source with a missing saved application as a new transaction', async () => {
    const f = await incremental();
    const id = f.correct();
    const creation = await f.create();
    const data = f.rows.get(f.key({ PK: `FINANCE#TRANSACTION#${id}`, SK: 'SPEND_CONTRIBUTION' }))!
      .data as Record<string, unknown>;
    delete data.coverageApplication;
    const writes = f.writes;
    await expect(
      f.service.applyPublishedSource(id, { creationPublicationId: creation.publicationId }),
    ).rejects.toThrow(/creation|baseline/i);
    expect(f.writes).toBe(writes);
    expect(f.rows.get(f.key(f.marker))?.coverageSourceCount).toBe(3);
  });

  it('serializes competing new-source enrollments and retries the conflict without losing either source', async () => {
    const f = await incremental(0);
    const a = await f.create(0),
      b = await f.create(1);
    const inputs = [a, b];
    const results = await Promise.allSettled(
      inputs.map((source) =>
        f.service.applyPublishedSource(source.id, { creationPublicationId: source.publicationId }),
      ),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const [index, result] of results.entries())
      if (result.status === 'rejected') {
        const source = inputs[index]!;
        await f.service.applyPublishedSource(source.id, {
          creationPublicationId: source.publicationId,
        });
      }
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageSourceCount: 2,
      coverageDependencyUseCounts: { [f.meta.PK]: 2, 'FINANCE#CATALOG': 2 },
      coverageVerified: false,
    });
  });

  it('recovers a lost creation-enrollment response and replays without incrementing the account twice', async () => {
    const f = await incremental(0);
    const source = await f.create();
    f.loseResponseAt(f.writes + 1);
    await expect(
      f.service.applyPublishedSource(source.id, { creationPublicationId: source.publicationId }),
    ).resolves.toEqual({ applied: true });
    const writes = f.writes;
    expect(
      await f.service.applyPublishedSource(source.id, {
        creationPublicationId: source.publicationId,
      }),
    ).toEqual({ applied: false });
    expect(f.writes).toBe(writes);
    expect(f.rows.get(f.key(f.marker))?.coverageSourceCount).toBe(1);
  });
});

describe('proven new-account publication initialization', () => {
  async function creation() {
    const f = financePersistenceFixture(),
      accountId = experienceId(9900),
      PK = 'FINANCE#SCOPE#OWNER#new';
    const work = () => new FinanceUnitOfWork(f.persistence, 'table');
    const unit = work(),
      key = { PK, SK: `ROW#accounts#${accountId}` };
    await unit.put({
      ...key,
      collection: 'accounts',
      entryKey: accountId,
      data: { id: accountId, version: 1 },
    });
    await unit.put({ ...financeLocatorKey('accounts', accountId), storageKey: key });
    await unit.put({ PK, SK: 'META', revision: 1 });
    await unit.commit({
      key: { PK: 'FIXTURE', SK: 'create' },
      fingerprint: 'create',
      result: true,
      expiresAt: 2_000_000_000,
    });
    const manifest = [...f.rows.values()].find((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX')!;
    const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    const initialize = (id = manifest.id as string) =>
      initializeFinanceProjectionAccount(accountId, id, work);
    return {
      ...f,
      get writes() {
        return f.writes;
      },
      work,
      PK,
      accountId,
      manifest,
      marker,
      initialize,
    };
  }
  it('initializes an unavailable zero-source baseline before the proven account creation revision', async () => {
    const f = await creation();
    expect(f.rows.get(f.key({ PK: f.PK, SK: 'META' }))?.refundRelationshipIndexVersion).toBe(1);
    expect(await f.initialize()).toEqual({ initialized: true });
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      state: 'awaiting-coverage',
      coverageVerified: false,
      coverageSourceCount: 0,
      coverageDependencies: { [f.PK]: 0 },
      coverageDependencyUseCounts: {},
      coverageOriginalSourceUseCounts: {},
      originalSourceAccountIds: [],
      incrementalCoverageVersion: 1,
      accountIndexOrderVersion: 1,
      creationBootstrapId: f.manifest.id,
    });
    expect(
      [...f.rows.values()].filter((row) => row.PK.startsWith('FINANCE#PROJECTION_DEPENDENCY#')),
    ).toHaveLength(1);
    const writes = f.writes;
    expect(await f.initialize()).toEqual({ initialized: false });
    expect(f.writes).toBe(writes);
  });
  it('refuses to replace existing projection work even when account creation evidence is valid', async () => {
    const f = await creation();
    for (const state of ['ready', 'rebuilding', 'awaiting-coverage']) {
      const prior = { ...f.marker, state, revision: 19, operation: 'preserve-existing-work' };
      f.rows.set(f.key(f.marker), prior);
      const writes = f.writes;
      await expect(f.initialize()).rejects.toThrow(/existing|baseline|projection/i);
      expect(f.rows.get(f.key(f.marker))).toEqual(prior);
      expect(f.writes).toBe(writes);
    }
  });
  it('rejects missing, mismatched or detached creation evidence before writing a baseline', async () => {
    const f = await creation();
    const writes = f.writes;
    await expect(f.initialize('f'.repeat(64))).rejects.toThrow(/manifest|creation/i);
    const journal = [...f.rows.values()].find(
      (row) => row.PK === f.PK && row.SK.startsWith('PUBLICATION_CHANGE#'),
    )!;
    f.rows.delete(f.key(journal));
    await expect(f.initialize()).rejects.toThrow(/journal|creation/i);
    f.rows.set(f.key(journal), journal);
    const replacement = financePublicationJournalRecords(
      [
        {
          scopePK: f.PK,
          keyHash: 'a'.repeat(64),
          collection: 'accounts',
          sourceId: experienceId(9901),
          accountIds: [experienceId(9901)],
          afterVersion: 1,
        },
      ],
      [{ PK: f.PK, beforeRevision: 0, afterRevision: 1 }],
    );
    for (const row of replacement) f.rows.set(f.key(row), row);
    await expect(f.initialize(replacement[0]!.id as string)).rejects.toThrow(/creation|account/i);
    expect(f.writes).toBe(writes);
    expect(f.rows.has(f.key(f.marker))).toBe(false);
  });
  it('rejects scope moves and a nonempty preexisting projection index instead of assuming a new account', async () => {
    const f = await creation();
    const records = financePublicationJournalRecords(
      [
        {
          scopePK: f.PK,
          keyHash: 'a'.repeat(64),
          collection: 'accounts',
          sourceId: f.accountId,
          accountIds: [f.accountId],
          afterVersion: 2,
        },
        {
          scopePK: 'FINANCE#SCOPE#OWNER#old',
          keyHash: 'b'.repeat(64),
          collection: 'accounts',
          sourceId: f.accountId,
          accountIds: [f.accountId],
          beforeVersion: 1,
        },
      ],
      [
        { PK: f.PK, beforeRevision: 0, afterRevision: 1 },
        { PK: 'FINANCE#SCOPE#OWNER#old', beforeRevision: 1, afterRevision: 2 },
      ],
    );
    for (const row of records) f.rows.set(f.key(row), row);
    await expect(f.initialize(records[0]!.id as string)).rejects.toThrow(/creation|move|account/i);
    const journal = {
      PK: f.PK,
      SK: 'PUBLICATION_CHANGE#0000000000000001',
      format: f.manifest.format,
      publicationId: f.manifest.id,
      beforeRevision: 0,
      afterRevision: 1,
    };
    f.rows.set(f.key(journal), journal);
    const key = { PK: `FINANCE#FACT_ACCOUNT#${f.accountId}`, SK: 'CARDINALITY' };
    f.rows.set(f.key(key), { ...key, facts: 1 });
    await expect(f.initialize()).rejects.toThrow(/cardinality|empty|projection/i);
    expect(f.rows.has(f.key(f.marker))).toBe(false);
  });
  it('recovers interrupted, lost-response and competing initialization transactions without resetting the account', async () => {
    const f = await creation();
    f.failAt(f.writes + 1);
    await expect(f.initialize()).rejects.toThrow(/interrupted/i);
    expect(f.rows.has(f.key(f.marker))).toBe(false);
    expect(
      [...f.rows.values()].filter((row) => row.PK.startsWith('FINANCE#PROJECTION_DEPENDENCY#')),
    ).toHaveLength(0);
    f.failAt(-1);
    f.loseResponseAt(f.writes + 1);
    const results = await Promise.all([f.initialize(), f.initialize()]);
    expect(results.every((result) => result.initialized)).toBe(true);
    expect(f.rows.get(f.key(f.marker))?.revision).toBe(1);
    expect(
      [...f.rows.values()].filter((row) => row.PK.startsWith('FINANCE#PROJECTION_DEPENDENCY#')),
    ).toHaveLength(1);
    expect(await f.initialize()).toEqual({ initialized: false });
  });
});
