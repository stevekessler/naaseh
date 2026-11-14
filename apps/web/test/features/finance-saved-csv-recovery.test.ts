import { expect, it } from 'vitest';
import { prepareSavedCsvSubmission } from '../../src/features/finance/csv/saved-csv-recovery.js';

it('requires a check for every saved row and only submits the included rows', async () => {
  const rows = [1, 2, 3].map((ordinal) => ({
    ordinal,
    amountMinor: -100,
    transactedAt: '2026-11-09T00:00:00.000Z',
    description: 'Fixture',
  }));
  await expect(
    prepareSavedCsvSubmission('saved', 'account', rows, (row) =>
      row.ordinal === 2 ? undefined : { duplicate: false },
    ),
  ).rejects.toThrow('Check every saved row');
  await expect(
    prepareSavedCsvSubmission('saved', 'account', rows, () => ({ duplicate: true })),
  ).rejects.toThrow('decide whether to include');
  const [chunk] = await prepareSavedCsvSubmission('saved', 'account', rows, (row) => {
    if (row.ordinal === 1) return { duplicate: false };
    return { duplicate: true, decision: row.ordinal === 2 ? 'exclude' : 'include' };
  });
  expect(chunk).toMatchObject({
    finalChunk: true,
    duplicateReviewSummary: { suspected: 2, included: 1, excluded: 1, unresolved: 0 },
    rows: [
      { ordinal: 1, duplicateDisposition: 'not-suspected' },
      { ordinal: 3, duplicateDisposition: 'included-after-review' },
    ],
  });
});
