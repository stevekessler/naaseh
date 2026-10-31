import { describe, expect, it } from 'vitest';
import {
  createFinanceFact,
  financeFactReferences,
  SpendProjectionService,
} from '../../apps/api/src/finance/spend-projection-service.js';
import { FinanceUnitOfWork } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { buildExperienceFixture } from '../fixtures/finance/experience.js';
function setup() {
  const f = financePersistenceFixture();
  const transaction = buildExperienceFixture().transactions[4]!;
  const fact = createFinanceFact(transaction, {});
  const service = new SpendProjectionService(() => new FinanceUnitOfWork(f.persistence, 'table'));
  return { ...f, f, transaction, fact, service };
}
describe('durable Finance contribution publication', () => {
  it('resumes an interrupted reference batch and publishes totals exactly once', async () => {
    const { f, fact, service } = setup();
    f.failAt(3);
    await expect(service.publish(fact)).rejects.toThrow(/interrupted/i);
    const marker = { PK: `FINANCE#PROJECTION_ACCOUNT#${fact.accountId}`, SK: 'CURRENT' };
    expect(f.rows.get(f.key(marker))?.state).toBe('rebuilding');
    await service.publish(fact);
    for (const reference of financeFactReferences(fact))
      expect(f.rows.has(f.key(reference))).toBe(true);
    const summary = { PK: `FINANCE#SUMMARY#${fact.accountId}#USD`, SK: 'MONTH#UTC#2026-10' };
    expect(f.rows.get(f.key(summary))?.amountMinor).toBe(2_000);
    const writes = f.writes;
    await service.publish(fact);
    expect(f.writes).toBe(writes);
    expect(f.rows.get(f.key(marker))?.state).toBe('ready');
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
    for (const old of financeFactReferences(fact)) expect(f.rows.has(f.key(old))).toBe(false);
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
});
