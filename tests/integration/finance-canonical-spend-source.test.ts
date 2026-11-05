import { FinanceAccountCoverageVerifier } from '../../apps/api/src/finance/account-coverage-service.js';
import { describe, expect, it } from 'vitest';
import {
  createFinancialTransaction,
  createBalancedAllocations,
  createExpenseRefundRelationship,
} from '@naaseh/domain';
import {
  loadCanonicalFinanceFact,
  financeRefundRelationshipLocator,
} from '../../apps/api/src/finance/canonical-spend-source.js';
import { FinanceUnitOfWork, financeLocatorKey } from '../../apps/api/src/finance/unit-of-work.js';
import { financePersistenceFixture } from '../fixtures/finance/persistence.js';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';
function setup() {
  const f = financePersistenceFixture();
  const fixture = buildExperienceFixture();
  const owner = 'FINANCE#SCOPE#OWNER#u1';
  const group = 'FINANCE#SCOPE#GROUP#household';
  const seed = (collection: string, id: string, value: unknown, PK = owner, revision = 1) => {
    const storageKey = { PK, SK: `ROW#${collection}#${id}` };
    const locator = financeLocatorKey(collection, id);
    f.rows.set(f.key(locator), { ...locator, storageKey });
    f.rows.set(f.key(storageKey), { ...storageKey, collection, entryKey: id, data: value });
    const meta = { PK, SK: 'META' };
    f.rows.set(f.key(meta), { ...meta, revision });
    return storageKey;
  };
  const item = fixture.budgetItems[0]!;
  const transaction = createFinancialTransaction({
    id: experienceId(9001),
    accountId: experienceId(9002),
    origin: 'manual',
    amountMinor: -100,
    currency: 'USD',
    postedAt: '2026-10-01T00:00:00.000Z',
    description: 'Synthetic source',
    pending: false,
    connectedAccount: false,
    merchantId: fixture.merchant.id,
  });
  transaction.allocations = createBalancedAllocations(
    -100,
    [
      {
        id: experienceId(9003),
        amountMinor: -100,
        financeCategoryId: item.financeCategoryId,
        budgetItemId: item.id,
      },
    ],
    'u1',
    new Date('2026-10-01T00:00:00Z'),
  );
  const source = seed('transactions', transaction.id, transaction);
  seed('accounts', transaction.accountId, { id: transaction.accountId });
  seed('budgetItems', item.id, item, group, 2);
  seed('merchants', fixture.merchant.id, fixture.merchant, 'FINANCE#CATALOG', 3);
  const work = () => new FinanceUnitOfWork(f.persistence, 'table');
  return { ...f, seed, transaction, source, item, merchant: fixture.merchant, owner, group, work };
}
describe('targeted canonical spend source reconstruction', () => {
  it('rebuilds budget/category and merchant context and pins every source scope', async () => {
    const f = setup();
    const result = await loadCanonicalFinanceFact(f.transaction.id, f.work);
    expect(result.fact).toMatchObject({
      merchantName: f.merchant.name,
      slices: [
        { amountMinor: 100, budgetId: f.item.budgetId, categoryId: f.item.financeCategoryId },
      ],
    });
    expect(result.dependencies).toEqual({ [f.owner]: 1, [f.group]: 2, 'FINANCE#CATALOG': 3 });
    const factKey = { PK: `FINANCE#FACT#${f.transaction.id}`, SK: 'CURRENT' };
    f.rows.set(f.key(factKey), {
      ...factKey,
      fact: { ...result.fact, textMonth: '2026-10', textOrdinal: 0 },
    });
    const countKey = { PK: `FINANCE#FACT_ACCOUNT#${f.transaction.accountId}`, SK: 'CARDINALITY' };
    f.rows.set(f.key(countKey), { ...countKey, facts: 1 });
    const verifier = new FinanceAccountCoverageVerifier({
      work: f.work,
      readPage: async () => ({
        rows: [
          {
            ...f.source,
            collection: 'transactions',
            entryKey: f.transaction.id,
            data: f.transaction,
          },
        ],
      }),
    });
    expect(await verifier.step(f.transaction.accountId)).toMatchObject({
      complete: true,
      verified: 1,
    });
  });
  it('reconstructs a confirmed cross-account refund using the shared negative-spend rule', async () => {
    const f = setup();
    const original = { ...f.transaction, accountId: experienceId(9010) };
    f.seed('transactions', original.id, original, 'FINANCE#SCOPE#OWNER#original', 4);
    f.seed(
      'accounts',
      original.accountId,
      { id: original.accountId },
      'FINANCE#SCOPE#OWNER#original',
      4,
    );
    const refund = createFinancialTransaction({
      id: experienceId(9011),
      accountId: f.transaction.accountId,
      origin: 'manual',
      amountMinor: 25,
      currency: 'USD',
      postedAt: '2026-10-02T00:00:00.000Z',
      description: 'Synthetic refund',
      pending: false,
      connectedAccount: false,
    });
    f.seed('transactions', refund.id, refund);
    const relationship = createExpenseRefundRelationship({
      id: experienceId(9012),
      original,
      refund,
      linkedAmountMinor: 25,
      refundedAllocations: [{ originalAllocationId: original.allocations[0]!.id, amountMinor: 25 }],
      confirmedPartialAllocations: true,
      existing: [],
      budgetItems: [f.item],
      actorId: 'u1',
    });
    const locator = financeRefundRelationshipLocator(refund.id);
    const storageKey = { PK: f.owner, SK: 'ROW#refundRelationships#singleton' };
    f.rows.set(f.key(locator), { ...locator, storageKey });
    f.rows.set(f.key(storageKey), {
      ...storageKey,
      collection: 'refundRelationships',
      entryKey: refund.id,
      data: relationship,
    });
    const result = await loadCanonicalFinanceFact(refund.id, f.work);
    expect(result.fact).toMatchObject({
      originalSourceAccountIds: [original.accountId],
      slices: [{ amountMinor: -25, budgetId: f.item.budgetId }],
    });
    expect(result.dependencies['FINANCE#SCOPE#OWNER#original']).toBe(4);
  });
  it('refuses missing required allocation or merchant sources instead of erasing their associations', async () => {
    const f = setup();
    f.rows.delete(f.key(financeLocatorKey('budgetItems', f.item.id)));
    await expect(loadCanonicalFinanceFact(f.transaction.id, f.work)).rejects.toThrow(
      /source|budget|coverage/i,
    );
    const g = setup();
    g.rows.delete(g.key(financeLocatorKey('merchants', g.merchant.id)));
    await expect(loadCanonicalFinanceFact(g.transaction.id, g.work)).rejects.toThrow(
      /source|merchant|coverage/i,
    );
    const h = setup();
    const credit = createFinancialTransaction({
      id: experienceId(9020),
      accountId: h.transaction.accountId,
      origin: 'manual',
      amountMinor: 25,
      currency: 'USD',
      postedAt: '2026-10-03T00:00:00.000Z',
      description: 'Unlinked synthetic credit',
      pending: false,
      connectedAccount: false,
    });
    h.seed('transactions', credit.id, credit);
    await expect(loadCanonicalFinanceFact(credit.id, h.work)).rejects.toThrow(/coverage|refund/i);
    const meta = { PK: h.owner, SK: 'META' };
    h.rows.set(h.key(meta), { ...meta, revision: 1, refundRelationshipIndexVersion: 1 });
    expect((await loadCanonicalFinanceFact(credit.id, h.work)).fact.slices).toEqual([]);
  });
  it('rejects stale scope reads before returning a reconstruction', async () => {
    const f = setup();
    const base = f.persistence.get;
    let calls = 0;
    f.persistence.get = async (key) => {
      const row = await base(key);
      if (key.PK === 'FINANCE#CATALOG' && key.SK === 'META' && ++calls === 2)
        return { ...key, revision: 4 };
      return row;
    };
    await expect(loadCanonicalFinanceFact(f.transaction.id, f.work)).rejects.toThrow(
      /revision|source|restart/i,
    );
  });
});
