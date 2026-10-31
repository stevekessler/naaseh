import { describe, expect, it } from 'vitest';
import { FinanceSearchIndex } from '../../apps/web/src/search/finance-index.js';
import {
  FINANCE_PERFORMANCE_PROFILE,
  buildFinanceSearchFixture,
  percentile95,
} from './fixtures/finance.js';

describe('Finance local search performance', () => {
  it('indexes 50 accounts and 100,000 transactions progressively, then searches within two seconds p95', async () => {
    const source = buildFinanceSearchFixture();
    const index = new FinanceSearchIndex();
    const progressTimes: number[] = [];
    const startedAt = performance.now();
    await index.replaceProgressively(source, {
      batchSize: 2_000,
      yieldToMain: () => Promise.resolve(),
      onProgress: ({ indexed }) => {
        if (indexed > 0 && progressTimes.length === 0)
          progressTimes.push(performance.now() - startedAt);
      },
    });
    expect(progressTimes[0]).toBeLessThan(1_000);

    const timings = Array.from({ length: FINANCE_PERFORMANCE_PROFILE.measuredIterations }, () => {
      const start = performance.now();
      const hits = index.search('performance needle', {
        includeTransactions: true,
        includeMerchants: false,
        limit: 20,
      });
      expect(hits.some(({ title }) => title === 'Performance needle purchase')).toBe(true);
      return performance.now() - start;
    });
    const p95Ms = percentile95(timings);
    console.info(JSON.stringify({ metric: 'finance-search-100k', p95Ms }));
    expect(p95Ms).toBeLessThan(2_000);
    index.clear();
  }, 30_000);
});
