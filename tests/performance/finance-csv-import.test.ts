import { mapFinanceCsvRows, parseFinanceCsv } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  FINANCE_PERFORMANCE_PROFILE,
  buildFinanceCsvFixture,
  percentile95,
} from './fixtures/finance.js';

describe('Finance CSV import performance', () => {
  it('parses and maps 50,000 rows within two seconds p95 and reports progress within one second', () => {
    const csv = buildFinanceCsvFixture();
    const timings: number[] = [];
    for (
      let iteration = 0;
      iteration < FINANCE_PERFORMANCE_PROFILE.measuredIterations;
      iteration += 1
    ) {
      const startedAt = performance.now();
      let firstProgressAt: number | undefined;
      const rows = parseFinanceCsv(csv, {
        onProgress: ({ rowsParsed }) => {
          if (rowsParsed > 0 && firstProgressAt === undefined) {
            firstProgressAt = performance.now() - startedAt;
          }
        },
      });
      const mapped = mapFinanceCsvRows(rows, {
        dateColumn: 'date',
        descriptionColumn: 'description',
        dateFormat: 'YYYY-MM-DD',
        amountMapping: { mode: 'signed', amountColumn: 'amount' },
        currency: 'USD',
      });
      expect(mapped).toHaveLength(FINANCE_PERFORMANCE_PROFILE.csvRowCount);
      expect(firstProgressAt).toBeLessThan(1_000);
      timings.push(performance.now() - startedAt);
    }
    const p95Ms = percentile95(timings);
    console.info(JSON.stringify({ metric: 'finance-csv-50k', p95Ms }));
    expect(p95Ms).toBeLessThan(2_000);
  }, 60_000);
});
