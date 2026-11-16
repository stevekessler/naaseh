import { expect, it } from 'vitest';
import { calculateCachedSpendTrend, financeTrendPeriods } from './spend-trends.js';
import { createFinancialTransaction } from './transaction.js';
import { createExpenseRefundRelationship } from './refund.js';

const id = (n: number) => `01J${String(n).padStart(23, '0')}`;

it('uses the requested local calendar for 12 months, eight quarters and five years', () => {
  const instant = '2026-01-01T01:00:00.000Z';
  const timeZone = 'America/Denver';
  const months = financeTrendPeriods('month', timeZone, instant);
  expect(months).toHaveLength(12);
  expect(months.at(-1)).toEqual({
    dateFrom: '2025-12-01',
    dateTo: '2025-12-31',
    label: '2025-12',
    partial: true,
  });
  const quarters = financeTrendPeriods('quarter', timeZone, instant);
  expect(quarters).toHaveLength(8);
  expect(quarters[0]).toMatchObject({ dateFrom: '2024-01-01', label: 'Q1 2024', partial: false });
  expect(financeTrendPeriods('year', timeZone, instant).map(({ label }) => label)).toEqual([
    '2021',
    '2022',
    '2023',
    '2024',
    '2025',
  ]);
  expect(financeTrendPeriods('month', 'UTC', instant).at(-1)?.label).toBe('2026-01');
});

it('keeps later partial refunds negative, zeros empty periods, and separates currencies', () => {
  const transaction = (
    n: number,
    account: number,
    amountMinor: number,
    postedAt: string,
    currency = 'USD',
  ) =>
    createFinancialTransaction({
      id: id(n),
      accountId: id(account),
      amountMinor,
      currency,
      origin: 'manual',
      description: 'Fixture',
      postedAt,
      pending: false,
      connectedAccount: false,
    });
  const original = transaction(1, 10, -10000, '2026-01-15T12:00:00.000Z');
  const refund1 = transaction(2, 10, 2500, '2026-03-01T03:00:00.000Z');
  const refund2 = transaction(3, 10, 3000, '2026-03-10T12:00:00.000Z');
  const first = createExpenseRefundRelationship({
    id: id(100),
    original,
    refund: refund1,
    linkedAmountMinor: 2500,
    confirmedPartialAllocations: false,
    existing: [],
    actorId: id(99),
  });
  const second = createExpenseRefundRelationship({
    id: id(101),
    original,
    refund: refund2,
    linkedAmountMinor: 3000,
    confirmedPartialAllocations: false,
    existing: [first],
    actorId: id(99),
  });
  const now = '2026-04-15T12:00:00.000Z';
  const timeZone = 'America/Denver';
  const periods = financeTrendPeriods('month', timeZone, now).slice(-4);
  const rows = calculateCachedSpendTrend({
    timeZone,
    periods,
    selected: [id(10), id(11)],
    refunds: [first, second],
    transactions: [
      original,
      refund1,
      refund2,
      transaction(4, 11, -825, '2026-01-15T12:00:00.000Z', 'EUR'),
      transaction(5, 10, 900, '2026-03-15T12:00:00.000Z'),
      { ...transaction(6, 10, -1000, '2026-03-15T12:00:00.000Z'), pending: true },
      { ...transaction(7, 10, -700, '2026-03-15T12:00:00.000Z'), transferId: id(80) },
      {
        ...transaction(8, 10, -500, '2026-03-15T12:00:00.000Z'),
        reconciliationState: 'provisional',
      },
      transaction(9, 12, -9000, '2026-03-15T12:00:00.000Z'),
    ],
  });
  expect(
    rows.map((values) => values.map(({ currency, amountMinor }) => [currency, amountMinor])),
  ).toEqual([
    [
      ['EUR', 825],
      ['USD', 10000],
    ],
    [['USD', -2500]],
    [['USD', -3000]],
    [],
  ]);
});
