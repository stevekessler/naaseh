import { projectTransactionBudgetLinks } from '../../apps/api/src/finance/transaction-query-service.js';
import { describe, expect, it } from 'vitest';
import {
  financeQueryEnvelopeSchema,
  financeQueryFiltersSchema,
  financeQueryStartSchema,
} from '@naaseh/contracts';
import {
  decodeFinanceCursor,
  encodeFinanceCursor,
  matchesFinanceFact,
  type FinanceFact,
} from '../../apps/api/src/finance/query-contract.js';

const accountId = '01J00000000000000000000601';
const otherAccountId = '01J00000000000000000000602';
const fact: FinanceFact = {
  id: '01J00000000000000000000611',
  accountId,
  effectiveAt: '2026-01-06T03:00:00.000Z',
  description: 'Monthly pickup',
  payee: 'Neighborhood Market',
  memo: 'Weekly GROCERIES',
  merchantName: 'Fixture Market',
  checkNumber: '000123',
  currency: 'USD',
  currencyExponent: 2,
  amountMinor: -1250,
  sourceVersion: 1,
  slices: [],
};

describe('Finance transaction browsing contracts', () => {
  it('combines exact checks, calendar date, signed amount, account and normalized text', () => {
    const { filters } = financeQueryStartSchema.parse({
      accountIds: [accountId],
      filters: {
        date: '2026-01-05',
        timeZone: 'America/Denver',
        amount: -1250,
        checkNumber: ' 000123 ',
        text: 'groceries',
      },
    });
    expect(matchesFinanceFact(fact, filters)).toBe(true);
    expect(matchesFinanceFact(fact, { ...filters, timeZone: 'UTC' })).toBe(false);
    expect(matchesFinanceFact(fact, { ...filters, amount: 1250 })).toBe(false);
    expect(matchesFinanceFact(fact, { ...filters, checkNumber: '123' })).toBe(false);
    expect(matchesFinanceFact(fact, { ...filters, accountIds: [otherAccountId] })).toBe(false);
    for (const text of ['monthly', 'NEIGHBORHOOD', 'fixture market'])
      expect(matchesFinanceFact(fact, { ...filters, text })).toBe(true);
  });

  it('accepts inclusive range endpoints and rejects ambiguous or reversed filters', () => {
    const filters = financeQueryFiltersSchema.parse({
      dateFrom: '2026-01-06',
      dateTo: '2026-01-06',
      amountMin: -1300,
      amountMax: -1250,
    });
    expect(matchesFinanceFact(fact, filters)).toBe(true);
    for (const invalid of [
      { ...filters, amount: -1250 },
      { ...filters, amountMin: 0 },
      { ...filters, date: '2026-01-06' },
      { ...filters, dateFrom: '2026-02-30' },
      { ...filters, dateFrom: '2026-01-07' },
      { ...filters, timeZone: 'Mountain' },
    ])
      expect(financeQueryFiltersSchema.safeParse(invalid).success).toBe(false);

    expect(
      financeQueryStartSchema.safeParse({
        accountIds: [accountId],
        filters: { accountIds: [accountId, otherAccountId] },
      }).success,
    ).toBe(false);
  });

  it('projects only authorized budget references and identifies genuinely missing links', async () => {
    const result = await projectTransactionBudgetLinks(
      {
        id: fact.id,
        allocations: [
          { id: 'accessible', budgetItemId: 'visible' },
          { id: 'also-accessible', budgetItemId: 'visible' },
          { id: 'private-allocation', budgetItemId: 'private-item' },
          { id: 'removed-allocation', budgetItemId: 'removed' },
        ],
      },
      async (id) =>
        id === 'visible'
          ? { status: 'visible', budgetId: 'authorized-budget', budgetName: 'Household budget' }
          : { status: id === 'removed' ? 'missing' : 'hidden' },
    );
    expect(result.budgetLinks).toEqual([{ id: 'authorized-budget', name: 'Household budget' }]);
    expect(result.missingBudget).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/private|removed/u);
  });

  it('binds opaque cursors to the actor, account, filters and current revisions', () => {
    const secret = 'b'.repeat(32);
    const now = Date.parse('2026-01-06T03:00:00Z');
    const context = {
      userId: 'owner',
      accountId,
      securityRevision: 2,
      sourceRevision: 'account:5|refund-source:3',
      filters: { checkNumber: '000123' },
    };
    const key = { PK: 'PRIVATE#ACCOUNT', SK: 'DATE#latest' };
    const cursor = encodeFinanceCursor(key, context, secret, now);
    expect(cursor).not.toContain(key.PK);
    expect(decodeFinanceCursor(cursor, context, secret, now)).toEqual(key);
    for (const changed of [
      { userId: 'other' },
      { accountId: otherAccountId },
      { securityRevision: 3 },
      { sourceRevision: 'account:5|refund-source:4' },
      { filters: { checkNumber: '123' } },
    ])
      expect(() => decodeFinanceCursor(cursor, { ...context, ...changed }, secret, now)).toThrow();
    expect(() => decodeFinanceCursor(cursor, context, secret, now + 15 * 60_000)).toThrow();
  });

  it('distinguishes rows from exact aggregates and progress from confirmed zero', () => {
    const pending = {
      items: [],
      nextCursor: 'opaque-continuation',
      asOf: fact.effectiveAt,
      projectionRevision: 'opaque-revision',
      complete: false,
      rowsState: 'searching',
      aggregateState: 'pending',
      coverage: { examined: 1000, scopeComplete: false },
    };
    expect(financeQueryEnvelopeSchema.safeParse(pending).success).toBe(true);
    expect(
      financeQueryEnvelopeSchema.safeParse({
        ...pending,
        items: [fact],
        rowsState: 'ready',
      }).success,
    ).toBe(true);
    for (const invalid of [
      { ...pending, totalCount: 0 },
      { ...pending, rowsState: 'confirmed-empty' },
      { ...pending, aggregateState: 'exact' },
    ])
      expect(financeQueryEnvelopeSchema.safeParse(invalid).success).toBe(false);
    expect(
      financeQueryEnvelopeSchema.safeParse({
        ...pending,
        nextCursor: undefined,
        complete: true,
        rowsState: 'confirmed-empty',
        aggregateState: 'exact',
        totalCount: 0,
        totalsByCurrency: [],
        coverage: { examined: 1050, scopeComplete: true },
      }).success,
    ).toBe(true);
  });
});
