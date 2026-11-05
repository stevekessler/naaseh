import { describe, expect, it } from 'vitest';
import { FinanceBackfillDriver } from '../../apps/api/src/finance/backfill-driver.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
function setup() {
  const f = financePersistenceFixture();
  const accountId = 'account';
  const PK = 'FINANCE#SCOPE#OWNER#u1';
  const accountKey = { PK, SK: 'ROW#accounts#account' };
  const locator = financeLocatorKey('accounts', accountId);
  f.rows.set(f.key(locator), { ...locator, storageKey: accountKey });
  f.rows.set(f.key(accountKey), {
    ...accountKey,
    collection: 'accounts',
    entryKey: accountId,
    data: { id: accountId },
  });
  f.rows.set(f.key({ PK, SK: 'META' }), { PK, SK: 'META', revision: 1 });
  const calls: string[] = [];
  let failPublish = false;
  let locatorMore = true;
  let coverageMore = true;
  const canonical = {
    id: 't1',
    accountId,
    effectiveAt: '2026-10-01T00:00:00.000Z',
    sourceVersion: 1,
    currency: 'USD',
    currencyExponent: 2,
    amountMinor: -100,
    description: 'Synthetic',
    slices: [],
  };
  const driver = new FinanceBackfillDriver({
    work: () => new FinanceUnitOfWork(f.persistence, 'table'),
    locators: async () => {
      calls.push('locators');
      const more = locatorMore;
      locatorMore = false;
      return { nextCursor: more ? { PK, SK: 'ROW#accounts#account' } : null, examined: 1 };
    },
    refundIndex: async () => {
      calls.push('refund-index');
      return { complete: true };
    },
    readSources: async () => ({
      rows: [
        {
          PK,
          SK: 'ROW#transactions#t1',
          entryKey: 't1',
          collection: 'transactions',
          data: { id: 't1', accountId, version: 1 },
        },
      ],
    }),
    canonical: async () => ({ fact: canonical, dependencies: { [PK]: 1 } }),
    publish: async () => {
      calls.push('publish');
      if (failPublish) {
        failPublish = false;
        throw new Error('Interrupted publication');
      }
    },
    coverage: async (_id, options) => {
      calls.push(options.restart ? 'coverage-restart' : 'coverage');
      const more = coverageMore;
      coverageMore = false;
      return { complete: !more, verified: 1 };
    },
  });
  return {
    ...f,
    driver,
    accountId,
    PK,
    calls,
    failNextPublication: () => {
      failPublish = true;
    },
  };
}
describe('explicit resumable Finance projection migration', () => {
  it('runs bounded locator, refund-index, publication and verification phases in order', async () => {
    const f = setup();
    for (let step = 0; step < 6; step++) await f.driver.step(f.accountId);
    expect(f.calls).toEqual([
      'locators',
      'locators',
      'refund-index',
      'publish',
      'coverage-restart',
      'coverage',
    ]);
    expect(await f.driver.step(f.accountId)).toMatchObject({ phase: 'complete', complete: true });
  });
  it('does not advance publication after an interrupted source and retries the same page', async () => {
    const f = setup();
    await f.driver.step(f.accountId);
    await f.driver.step(f.accountId);
    await f.driver.step(f.accountId);
    f.failNextPublication();
    await expect(f.driver.step(f.accountId)).rejects.toThrow(/interrupted/i);
    expect(await f.driver.step(f.accountId)).toMatchObject({ phase: 'coverage', complete: false });
    expect(f.calls.filter((call) => call === 'publish')).toHaveLength(2);
  });
  it('requires an explicit restart when the canonical scope changes during publication', async () => {
    const f = setup();
    await f.driver.step(f.accountId);
    await f.driver.step(f.accountId);
    await f.driver.step(f.accountId);
    const meta = { PK: f.PK, SK: 'META' };
    f.rows.set(f.key(meta), { ...meta, revision: 2 });
    await expect(f.driver.step(f.accountId)).rejects.toThrow(/revision|restart/i);
    expect(await f.driver.step(f.accountId, { restart: true })).toMatchObject({ complete: false });
    expect(f.rows.get(f.key(meta))?.revision).toBe(2);
  });
  it('rejects invalid calendar contexts before any publication', async () => {
    const f = setup();
    await expect(f.driver.step(f.accountId, { calendarBasis: 'Not/A_Time_Zone' })).rejects.toThrow(
      /calendar|zone/i,
    );
    expect(f.calls).toEqual([]);
  });
});
