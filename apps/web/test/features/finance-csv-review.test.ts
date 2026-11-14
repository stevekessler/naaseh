import { expect, it } from 'vitest';
import { DuplicateReview } from '../../src/features/finance/csv/csv-import.js';

it('omits excluded CSV rows and marks explicitly included duplicates', () => {
  const rows = [1, 2, 3].map((ordinal) => ({
    ordinal,
    date: '2026-11-09',
    transactedAt: '2026-11-09T00:00:00.000Z',
    amountMinor: -100,
    description: 'Fixture',
  }));
  const review = new DuplicateReview(rows.slice(0, 2));
  review.decide(1, 'include');
  expect(() => review.commitRows(rows)).toThrow('Complete duplicate review before importing.');
  review.decide(2, 'exclude');
  expect(review.commitRows(rows)).toEqual([
    { ...rows[0], duplicateDisposition: 'included-after-review' },
    { ...rows[2], duplicateDisposition: 'not-suspected' },
  ]);
});
