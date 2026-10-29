import { calculateBudgetTotals } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  FINANCE_PERFORMANCE_PROFILE,
  buildFinanceBudgetFixture,
  percentile95,
} from './fixtures/finance.js';

describe('Finance budget total performance', () => {
  it('calculates totals across 50 accounts and 100,000 transactions within two seconds p95', () => {
    const fixture = buildFinanceBudgetFixture();
    const timings = Array.from({ length: FINANCE_PERFORMANCE_PROFILE.measuredIterations }, () => {
      const start = performance.now();
      const result = calculateBudgetTotals(fixture);
      expect(result.totalsComplete).toBe(true);
      expect(result.byCurrency).toHaveLength(1);
      expect(result.byCategory).toHaveLength(20);
      return performance.now() - start;
    });
    const p95Ms = percentile95(timings);
    console.info(JSON.stringify({ metric: 'finance-budget-totals-100k', p95Ms }));
    expect(p95Ms).toBeLessThan(2_000);
  }, 30_000);
});
