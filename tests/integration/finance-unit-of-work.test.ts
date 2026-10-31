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

describe('touched-record Finance conditional units of work', () => {
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
  });
});
