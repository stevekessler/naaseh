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
