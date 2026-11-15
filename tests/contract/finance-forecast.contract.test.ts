import { describe, expect, it } from 'vitest';
import { financeForecastRequestSchema, financeForecastResultSchema } from '@naaseh/contracts';

const window = { dateFrom: '2026-04-01', dateTo: '2026-06-30', basis: 'budget' };
const actual = { incomeMinor: 500, expenseMinor: -100, netMinor: 600 };
const remaining = { incomeMinor: 40, expenseMinor: 100, netMinor: -60 };
const projected = { incomeMinor: 540, expenseMinor: 0, netMinor: 540 };
const row = { currency: 'USD', currencyExponent: 2, actual, remaining, projected };
const known = {
  budgetId: '01J00000000000000000000601',
  method: 'known-plan',
  timeZone: 'America/Denver',
  includeNonBudgetedHistory: false,
  window,
  asOfDate: '2026-04-15',
  sourceAsOf: '2026-04-16T01:00:00.000Z',
  sourceRevision: 'revision-a',
  coverage: 'complete',
  status: 'ready',
  currencies: [row],
};

describe('budget forecast contracts', () => {
  it('defaults to strict history and permits expansion only on explicit historical requests', () => {
    expect(financeForecastRequestSchema.parse({ method: 'historical' })).toMatchObject({
      includeNonBudgetedHistory: false,
    });
    expect(
      financeForecastRequestSchema.safeParse({
        method: 'known-plan',
        includeNonBudgetedHistory: true,
      }).success,
    ).toBe(false);
    expect(
      financeForecastRequestSchema.safeParse({
        method: 'historical',
        includeNonBudgetedHistory: true,
      }).success,
    ).toBe(true);
    expect(
      financeForecastRequestSchema.safeParse({
        method: 'historical',
        includeNonBudgetedHistory: 'true',
      }).success,
    ).toBe(false);
    expect(
      financeForecastRequestSchema.safeParse({
        method: 'historical',
        sourceRevision: 'client-controlled',
      }).success,
    ).toBe(false);
  });

  it('requires paired ordered calendar dates and a valid time zone', () => {
    for (const request of [
      { dateFrom: '2026-04-01' },
      { dateFrom: '2026-04-02', dateTo: '2026-04-01' },
      { timeZone: 'fake' },
    ])
      expect(
        financeForecastRequestSchema.safeParse({ method: 'known-plan', ...request }).success,
      ).toBe(false);
    expect(
      financeForecastRequestSchema.safeParse({
        method: 'known-plan',
        dateFrom: '2026-04-01',
        dateTo: '2026-04-01',
      }).success,
    ).toBe(true);
  });

  it('binds the result to one method, window and server revision and rejects false totals', () => {
    expect(financeForecastResultSchema.safeParse(known).success).toBe(true);
    for (const response of [
      { ...known, sourceRevision: '' },
      { ...known, includeNonBudgetedHistory: true },
      { ...known, method: 'historical' },
      { ...known, currencies: [row, row] },
      { ...known, currencies: [{ ...row, currency: 'usd' }] },
      {
        ...known,
        currencies: [{ ...row, projected: { incomeMinor: 540, expenseMinor: 10, netMinor: 530 } }],
      },
    ])
      expect(financeForecastResultSchema.safeParse(response).success).toBe(false);
  });

  it('keeps partial history and unavailable predictions explicit', () => {
    const response = {
      ...known,
      method: 'historical',
      coverage: 'partial',
      status: 'insufficient-history',
      observed: { dateFrom: '2025-10-01', dateTo: '2026-03-31', coveredMonths: 2 },
      currencies: [{ ...row, remaining: null, projected: null }],
    };
    expect(financeForecastResultSchema.safeParse(response).success).toBe(true);
    expect(
      financeForecastResultSchema.safeParse({ ...response, coverage: 'complete' }).success,
    ).toBe(false);
    expect(financeForecastResultSchema.safeParse({ ...response, currencies: [row] }).success).toBe(
      false,
    );
  });
});
