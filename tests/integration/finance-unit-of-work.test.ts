import { describe, expect, it } from 'vitest';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
const key = { PK: 'FINANCE#TRANSACTION#t1', SK: 'CURRENT' };
const receipt = (name: string) => ({
  key: { PK: 'USER#u1', SK: `MUTATION#${name}` },
  fingerprint: name,
  result: { saved: true },
  expiresAt: 2_000_000_000,
});
function canonicalSetup() {
  const f = financePersistenceFixture();
  const meta = { PK: 'FINANCE#SCOPE#OWNER#u1', SK: 'META' };
  const source = {
    PK: meta.PK,
    SK: 'ROW#transactions#t1',
    collection: 'transactions',
    entryKey: 't1',
    data: {
      id: 't1',
      accountId: 'account',
      version: 1,
      amountMinor: -100,
      description: 'private synthetic financial description',
    },
  };
  f.rows.set(f.key(meta), { ...meta, revision: 1 });
  f.rows.set(f.key(source), source);
  const stage = async () => {
    const work = new FinanceUnitOfWork(f.persistence, 'table');
    await work.put({ ...source, data: { ...source.data, version: 2, amountMinor: -70 } });
    await work.put({ ...meta, revision: 2 });
    return work;
  };
  return {
    ...f,
    get writes() {
      return f.writes;
    },
    meta,
    source,
    stage,
  };
}

describe('touched-record Finance conditional units of work', () => {
  it('atomically journals canonical source identities and scope revisions without copying financial content', async () => {
    const f = canonicalSetup();
    const work = await f.stage();
    const privateLock = 'private synthetic financial category lock';
    await work.put({
      PK: f.meta.PK,
      SK: `ROW#categoryNameLocks#${privateLock}`,
      collection: 'categoryNameLocks',
      entryKey: privateLock,
      data: 'opaque-lock-value',
    });
    await work.commit(receipt('canonical'));
    const pending = [...f.rows.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX');
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      state: 'pending',
      changes: expect.arrayContaining([
        expect.objectContaining({
          collection: 'transactions',
          sourceId: 't1',
          accountIds: ['account'],
          beforeVersion: 1,
          afterVersion: 2,
        }),
      ]),
      scopes: [{ PK: f.meta.PK, beforeRevision: 1, afterRevision: 2 }],
    });
    expect(JSON.stringify(pending)).not.toContain(f.source.data.description);
    expect(JSON.stringify(pending)).not.toContain(privateLock);
    expect(pending[0]).not.toHaveProperty('expiresAt');
    for (const change of pending[0]!.changes as Array<Record<string, unknown>>) {
      expect(change).not.toHaveProperty('data');
      expect(change).not.toHaveProperty('amountMinor');
    }
    expect(
      f.rows.get(f.key({ PK: f.meta.PK, SK: 'PUBLICATION_CHANGE#0000000000000002' })),
    ).toMatchObject({ publicationId: pending[0]!.id, beforeRevision: 1, afterRevision: 2 });
  });

  it('leaves no canonical, receipt or journal half-commit after a storage outage', async () => {
    const f = canonicalSetup();
    f.failAt(1);
    await expect((await f.stage()).commit(receipt('outage'))).rejects.toThrow(/interrupted/i);
    expect(f.rows.size).toBe(2);
    expect(f.rows.get(f.key(f.meta))?.revision).toBe(1);
    expect(await (await f.stage()).commit(receipt('outage'))).toEqual({ saved: true });
    expect(
      [...f.rows.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(1);
  });

  it('recovers concurrent identical canonical retries and a lost response with one durable request', async () => {
    const f = canonicalSetup();
    f.loseResponseAt(1);
    const first = await f.stage();
    const second = await f.stage();
    expect(
      await Promise.all([
        first.commit(receipt('same-canonical')),
        second.commit(receipt('same-canonical')),
      ]),
    ).toEqual([{ saved: true }, { saved: true }]);
    expect(
      [...f.rows.values()].filter((row) => row.PK === 'FINANCE#PUBLICATION_OUTBOX'),
    ).toHaveLength(1);
    expect(f.rows.get(f.key(f.meta))?.revision).toBe(2);
  });

  it('requires the canonical scope revision transition and counts journal rows against the atomic limit', async () => {
    const f = canonicalSetup();
    for (const revision of [undefined, 1]) {
      const work = new FinanceUnitOfWork(f.persistence, 'table');
      await work.put({ ...f.source, data: { ...f.source.data, version: 2 } });
      if (revision !== undefined) await work.put({ ...f.meta, revision });
      await expect(work.commit(receipt(`bad-${revision}`))).rejects.toThrow(/revision|scope/i);
    }
    const large = await f.stage();
    for (let i = 0; i < 96; i++) await large.get({ PK: `READ#${i}`, SK: 'CURRENT' });
    await expect(large.commit(receipt('journal-limit'))).rejects.toThrow(/100 touched/i);
    expect(f.writes).toBe(0);
  });
  it('rejects competing writes atomically and protects previously read authorization records', async () => {
    const f = financePersistenceFixture();
    f.rows.set(f.key(key), { ...key, version: 1, amountMinor: 100 });
    const first = new FinanceUnitOfWork(f.persistence, 'table');
    const second = new FinanceUnitOfWork(f.persistence, 'table');
    await first.get(key);
    await second.get(key);
    await first.put({ ...key, version: 2, amountMinor: 70 });
    await second.put({ ...key, version: 2, amountMinor: 80 });
    await first.commit(receipt('first'));
    await expect(second.commit(receipt('second'))).rejects.toThrow(/conflict/i);
    expect(f.rows.get(f.key(key))?.amountMinor).toBe(70);
    expect(f.rows.has(f.key(receipt('second').key))).toBe(false);
  });

  it('recovers a lost commit response and replays the same receipt without another write', async () => {
    const f = financePersistenceFixture();
    f.loseResponseAt(1);
    const first = new FinanceUnitOfWork(f.persistence, 'table');
    await first.put({ ...key, version: 1 });
    expect(await first.commit(receipt('same'))).toEqual({ saved: true });
    const retry = new FinanceUnitOfWork(f.persistence, 'table');
    expect(await retry.commit(receipt('same'))).toEqual({ saved: true });
    expect(f.writes).toBe(1);
    const collision = new FinanceUnitOfWork(f.persistence, 'table');
    await expect(
      collision.commit({ ...receipt('same'), fingerprint: 'different' }),
    ).rejects.toThrow(/identity conflict/i);
  });

  it('conditions negative reads and rejects oversized graphs before writing', async () => {
    const f = financePersistenceFixture();
    const work = new FinanceUnitOfWork(f.persistence, 'table');
    await work.get(key);
    f.rows.set(f.key(key), { ...key, version: 1 });
    await expect(work.commit(receipt('negative'))).rejects.toThrow(/conflict/i);
    const large = new FinanceUnitOfWork(f.persistence, 'table');
    for (let i = 0; i < 100; i++) await large.get({ PK: `P#${i}`, SK: 'CURRENT' });
    const before = f.writes;
    await expect(large.commit(receipt('large'))).rejects.toThrow(/100 touched/i);
    expect(f.writes).toBe(before);
    const bytes = new FinanceUnitOfWork(f.persistence, 'table');
    for (let i = 0; i < 6; i++) {
      const item = { PK: `LARGE#${i}`, SK: 'CURRENT', version: 1, payload: 'x'.repeat(300000) };
      f.rows.set(f.key(item), item);
      await bytes.put({ ...item, version: 2, payload: 'y'.repeat(300000) });
    }
    await expect(bytes.commit(receipt('byte-budget'))).rejects.toThrow(/byte budget/i);
    expect(f.writes).toBe(before);
  });
});
