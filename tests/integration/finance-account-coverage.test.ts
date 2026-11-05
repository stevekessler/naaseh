import { describe, expect, it } from 'vitest';
import { FinanceAccountCoverageVerifier } from '../../apps/api/src/finance/account-coverage-service.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';

function setup(size = 3) {
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
    const fact = {
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
    return row;
  });
  const cardinality = { PK: `FINANCE#FACT_ACCOUNT#${accountId}`, SK: 'CARDINALITY' };
  f.rows.set(f.key(cardinality), { ...cardinality, facts: size });
  const catalog = { PK: 'FINANCE#CATALOG', SK: 'META' };
  f.rows.set(f.key(catalog), { ...catalog, revision: 1 });
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
      },
    }),
    pageSize: 2,
  });
  return { ...f, service, accountId, marker, meta, canonicalRows: rows, catalog, requested };
}
describe('bounded canonical account coverage proof', () => {
  it('resumes pages without certifying a partial canonical scope', async () => {
    const f = setup();
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: false, verified: 2 });
    expect(f.rows.get(f.key(f.marker))?.coverageVerified).toBe(false);
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: true, verified: 3 });
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
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: true, verified: 3 });
    const g = setup(1);
    await g.service.step(g.accountId);
    const catalog = { PK: 'FINANCE#CATALOG', SK: 'META' };
    g.rows.set(g.key(catalog), { ...catalog, revision: 2 });
    await expect(g.service.step(g.accountId)).rejects.toThrow(/revision|restart/i);
  });
  it('certifies empty scope only after canonical enumeration and exact cardinality reconciliation', async () => {
    const f = setup(0);
    expect(await f.service.step(f.accountId)).toMatchObject({ complete: true, verified: 0 });
    expect(f.rows.get(f.key(f.marker))).toMatchObject({
      coverageVerified: true,
      coverageDependencies: { 'FINANCE#SCOPE#OWNER#u1': 1 },
    });
    const g = setup(0);
    const key = { PK: `FINANCE#FACT_ACCOUNT#${g.accountId}`, SK: 'CARDINALITY' };
    g.rows.set(g.key(key), { ...key, facts: 1 });
    await expect(g.service.step(g.accountId)).rejects.toThrow(/cardinality|projection/i);
    expect(g.rows.get(g.key(g.marker))?.coverageVerified).toBe(false);
  });
});
