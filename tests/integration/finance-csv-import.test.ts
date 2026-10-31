import { describe, expect, it } from 'vitest';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { commitCsvImportChunk } from '../../apps/api/src/finance/csv-import-service.js';

describe('CSV import receipts', () => {
  it('commits chunks idempotently and requires every suspected duplicate decision', async () => {
    const repository = new FinanceMemoryRepository();
    const chunk = {
      accountId: 'account-1',
      batchId: 'batch-1',
      fileDigest: 'a'.repeat(64),
      duplicateDecisionDigest: 'b'.repeat(64),
      duplicateReviewSummary: { suspected: 1, included: 1, excluded: 0, unresolved: 0 },
      chunkIndex: 0,
      finalChunk: true,
      rows: [
        {
          ordinal: 1,
          amountMinor: -100,
          transactedAt: '2026-01-01T00:00:00.000Z',
          description: 'Fixture',
          duplicateDisposition: 'included-after-review' as const,
        },
      ],
    };
    const first = await commitCsvImportChunk(repository, chunk);
    const replay = await commitCsvImportChunk(repository, chunk);
    expect(replay).toEqual(first);
    expect(repository.transactions).toHaveLength(1);
  });

  it('rejects an unresolved duplicate walkthrough', async () => {
    const repository = new FinanceMemoryRepository();
    await expect(
      commitCsvImportChunk(repository, {
        accountId: 'account-1',
        batchId: 'batch-1',
        fileDigest: 'a'.repeat(64),
        duplicateDecisionDigest: 'b'.repeat(64),
        chunkIndex: 0,
        finalChunk: true,
        duplicateReviewSummary: { suspected: 1, included: 0, excluded: 0, unresolved: 1 },
        rows: [],
      }),
    ).rejects.toThrow(/duplicate/i);
  });

  it('aggregates partial chunks and retries only failed row receipts', async () => {
    const repository = new FinanceMemoryRepository();
    const common = {
      accountId: 'account-1',
      batchId: 'batch-1',
      fileDigest: 'a'.repeat(64),
      duplicateDecisionDigest: 'b'.repeat(64),
      duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
    };
    await commitCsvImportChunk(repository, {
      ...common,
      chunkIndex: 0,
      finalChunk: false,
      rows: [
        {
          ordinal: 1,
          amountMinor: -100,
          transactedAt: '2026-01-01T00:00:00.000Z',
          description: 'One',
          duplicateDisposition: 'not-suspected',
        },
      ],
    });
    const partial = await commitCsvImportChunk(repository, {
      ...common,
      chunkIndex: 1,
      finalChunk: true,
      rows: [
        {
          ordinal: 2,
          amountMinor: Number.NaN,
          transactedAt: '2026-01-02T00:00:00.000Z',
          description: 'Bad',
          duplicateDisposition: 'not-suspected',
        },
      ],
    });
    expect(partial).toMatchObject({
      status: 'partial',
      counts: { accepted: 2, committed: 1, failed: 1 },
      failedOrdinals: [2],
    });
    const recovered = await commitCsvImportChunk(repository, {
      ...common,
      chunkIndex: 2,
      finalChunk: true,
      rows: [
        {
          ordinal: 2,
          amountMinor: -200,
          transactedAt: '2026-01-02T00:00:00.000Z',
          description: 'Two',
          duplicateDisposition: 'not-suspected',
        },
      ],
    });
    expect(recovered).toMatchObject({
      status: 'succeeded',
      counts: { accepted: 2, committed: 2, failed: 0 },
    });
  });

  it('rechecks suspected values against committed rows at commit time', async () => {
    const repository = new FinanceMemoryRepository();
    repository.transactions.push({
      id: 'existing',
      accountId: 'account-1',
      amountMinor: -100,
      effectiveAt: '2026-01-01T00:00:00.000Z',
      description: 'Coffee',
    });
    await expect(
      commitCsvImportChunk(repository, {
        accountId: 'account-1',
        batchId: 'batch-1',
        fileDigest: 'a'.repeat(64),
        duplicateDecisionDigest: 'b'.repeat(64),
        chunkIndex: 0,
        finalChunk: true,
        duplicateReviewSummary: { suspected: 0, included: 0, excluded: 0, unresolved: 0 },
        rows: [
          {
            ordinal: 1,
            amountMinor: -100,
            transactedAt: '2026-01-01T00:00:00.000Z',
            description: 'Coffee',
            duplicateDisposition: 'not-suspected',
          },
        ],
      }),
    ).rejects.toThrow(/duplicate review/i);
  });
});
