import { createUlid, digestCsvBytes, digestDuplicateDecisions } from '@naaseh/domain';
import type { SavedCsvRecoveryRow } from '../../../db/finance-repository.js';
import { chunkReviewedRows, type DuplicateDecision } from './csv-import.js';

export class SavedCsvReviewError extends Error {}

export async function prepareSavedCsvSubmission(
  batchId: string,
  accountId: string,
  rows: SavedCsvRecoveryRow[],
  review: (
    row: SavedCsvRecoveryRow,
  ) => { duplicate: boolean; decision?: DuplicateDecision } | undefined,
) {
  const included = [];
  const decisions: Array<{ ordinal: number; decision: DuplicateDecision }> = [];
  for (const row of rows) {
    const reviewed = review(row);
    if (!reviewed || (reviewed.duplicate && !reviewed.decision))
      throw new SavedCsvReviewError(
        'Check every saved row and decide whether to include each possible duplicate.',
      );
    if (reviewed.duplicate && reviewed.decision)
      decisions.push({ ordinal: row.ordinal, decision: reviewed.decision });
    if (!reviewed.duplicate || reviewed.decision === 'include') {
      included.push({
        ...row,
        duplicateDisposition: reviewed.duplicate
          ? ('included-after-review' as const)
          : ('not-suspected' as const),
      });
    }
  }
  if (!included.length) throw new SavedCsvReviewError('Select at least one row to import.');
  const replacementId = createUlid();
  const fileDigest = await digestCsvBytes(
    new TextEncoder().encode(JSON.stringify(['saved-csv', accountId, batchId, rows])),
  );
  const duplicateDecisionDigest = await digestDuplicateDecisions(
    decisions.map(({ ordinal }) => ordinal),
    decisions,
  );
  const excluded = rows.length - included.length;
  const chunks = chunkReviewedRows(included);
  return chunks.map((chunk, chunkIndex) => ({
    batchId: replacementId,
    fileDigest,
    mapping: {
      dateColumn: 'Date',
      descriptionColumn: 'Description',
      dateFormat: 'YYYY-MM-DD' as const,
      amountMapping: { mode: 'signed' as const, amountColumn: 'Amount' },
    },
    duplicateDecisionDigest,
    duplicateReviewSummary: {
      suspected: decisions.length,
      included: decisions.length - excluded,
      excluded,
      unresolved: 0 as const,
    },
    chunkIndex,
    finalChunk: chunkIndex === chunks.length - 1,
    rows: chunk,
  }));
}
