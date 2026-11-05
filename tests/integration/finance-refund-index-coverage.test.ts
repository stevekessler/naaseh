import { describe, expect, it } from 'vitest';
import { FinanceRefundIndexVerifier } from '../../apps/api/src/finance/refund-index-coverage-service.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { experienceId } from '../fixtures/finance/experience.js';
function setup(count = 0) {
  const f = financePersistenceFixture();
  const PK = 'FINANCE#SCOPE#OWNER#u1';
  const meta = { PK, SK: 'META' };
  f.rows.set(f.key(meta), { ...meta, revision: 1 });
  const sourceRows = Array.from({ length: count }, (_, index) => {
    const credit = experienceId(9200 + index);
    const original = experienceId(9300 + index);
    const row = {
      PK,
      SK: `ROW#refundRelationships#${index}`,
      entryKey: credit,
      collection: 'refundRelationships',
      data: {
        id: experienceId(9400 + index),
        refundTransactionId: credit,
        originalExpenseTransactionId: original,
        linkedAmountMinor: 10,
        currency: 'USD',
        currencyExponent: 2,
        refundedAllocations: [
          {
            originalAllocationId: `unallocated:${original}`,
            amountMinor: 10,
            originalAllocationRevision: 1,
          },
        ],
        refundSourceVersion: 1,
        originalSourceVersion: 1,
        status: 'active',
        calculationState: 'valid',
        createdBy: 'u1',
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
        version: 1,
      },
    };
    const locator = financeLocatorKey('refundRelationships', credit);
    f.rows.set(f.key(locator), { ...locator, storageKey: { PK, SK: row.SK } });
    f.rows.set(f.key(row), row);
    const transaction = { PK, SK: `ROW#transactions#${index}` };
    const transactionLocator = financeLocatorKey('transactions', credit);
    f.rows.set(f.key(transactionLocator), { ...transactionLocator, storageKey: transaction });
    f.rows.set(f.key(transaction), {
      ...transaction,
      collection: 'transactions',
      entryKey: credit,
      data: { id: credit, accountId: experienceId(9500) },
    });
    return row;
  });
  const service = new FinanceRefundIndexVerifier({
    work: () => new FinanceUnitOfWork(f.persistence, 'table'),
    pageSize: 1,
    readPage: async (_partition, cursor) => {
      const offset = cursor ? Number(cursor.SK.split('#').at(-1)) + 1 : 0;
      const rows = sourceRows.slice(offset, offset + 1);
      return {
        rows,
        ...(offset + rows.length < sourceRows.length
          ? { nextKey: { PK, SK: rows.at(-1)!.SK } }
          : {}),
      };
    },
  });
  return { ...f, PK, meta, sourceRows, service };
}
describe('bounded refund singleton index coverage', () => {
  it('certifies a verified empty relationship collection atomically and survives an interrupted write', async () => {
    const f = setup();
    f.failAt(1);
    await expect(f.service.step(f.PK)).rejects.toThrow(/interrupted/i);
    expect(f.rows.get(f.key(f.meta))?.refundRelationshipIndexVersion).toBeUndefined();
    expect(await f.service.step(f.PK)).toMatchObject({ complete: true, examined: 0 });
    expect(f.rows.get(f.key(f.meta))).toMatchObject({
      revision: 2,
      refundRelationshipIndexVersion: 1,
    });
  });
  it('keeps partial coverage unverified and rejects a changed source revision before resuming', async () => {
    const f = setup(2);
    expect(await f.service.step(f.PK)).toMatchObject({ complete: false, examined: 1 });
    expect(f.rows.get(f.key(f.meta))?.refundRelationshipIndexVersion).toBeUndefined();
    f.rows.set(f.key(f.meta), { ...f.meta, revision: 2 });
    await expect(f.service.step(f.PK)).rejects.toThrow(/revision|restart/i);
    expect(await f.service.step(f.PK, { restart: true })).toMatchObject({
      complete: false,
      examined: 1,
    });
    expect(await f.service.step(f.PK)).toMatchObject({ complete: true, examined: 2 });
  });
  it('never blesses an orphan relationship or a locator pointing outside the credit scope', async () => {
    const f = setup(1);
    const row = f.sourceRows[0]!;
    f.rows.delete(f.key(financeLocatorKey('refundRelationships', row.entryKey)));
    await expect(f.service.step(f.PK)).rejects.toThrow(/locator|source|index/i);
    expect(f.rows.get(f.key(f.meta))?.refundRelationshipIndexVersion).toBeUndefined();
  });
});
