import { createHash } from 'node:crypto';
import { FinanceMemoryRepository } from './repository.js';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { createFinancialTransaction, deriveCurrentBalance, financeAudience } from '@naaseh/domain';

export interface CsvCommitChunk {
  accountId: string;
  batchId: string;
  fileDigest: string;
  duplicateDecisionDigest: string;
  duplicateReviewSummary: {
    suspected: number;
    included: number;
    excluded: number;
    unresolved: number;
  };
  chunkIndex: number;
  finalChunk: boolean;
  rows: ReadonlyArray<{
    ordinal: number;
    amountMinor: number;
    transactedAt: string;
    description: string;
    duplicateDisposition?: 'not-suspected' | 'included-after-review';
  }>;
}

interface MemoryCsvBatch {
  id: string;
  accountId: string;
  fileDigest: string;
  duplicateDecisionDigest: string;
  status: 'staged' | 'committing' | 'partial' | 'succeeded';
  chunks: Map<number, string>;
  finalChunkIndex?: number;
  counts: {
    accepted: number;
    committed: number;
    failed: number;
    suspectedDuplicates: number;
    includedDuplicates: number;
    excludedDuplicates: number;
  };
  failedOrdinals: number[];
}

const responseFor = (batch: MemoryCsvBatch) => ({
  id: batch.id,
  accountId: batch.accountId,
  fileDigest: batch.fileDigest,
  duplicateDecisionDigest: batch.duplicateDecisionDigest,
  status: batch.status,
  counts: batch.counts,
  failedOrdinals: batch.failedOrdinals,
});

export async function commitCsvImportChunk(
  repository: FinanceMemoryRepository,
  input: CsvCommitChunk,
) {
  if (
    input.duplicateReviewSummary.unresolved !== 0 ||
    input.duplicateReviewSummary.suspected !==
      input.duplicateReviewSummary.included + input.duplicateReviewSummary.excluded
  ) {
    throw new Error('Every suspected duplicate must be reviewed.');
  }

  const fileKey = `${input.accountId}:${input.fileDigest}`;
  const claimedBatch = repository.csvFileReceipts.get(fileKey);
  if (claimedBatch && claimedBatch !== input.batchId) {
    const prior = repository.csvBatches.get(`${input.accountId}:${claimedBatch}`) as
      | MemoryCsvBatch
      | undefined;
    if (prior) return responseFor(prior);
    throw new Error('CSV file replay receipt is inconsistent.');
  }

  const batchKey = `${input.accountId}:${input.batchId}`;
  const existing = repository.csvBatches.get(batchKey) as MemoryCsvBatch | undefined;
  const chunkDigest = createHash('sha256')
    .update(JSON.stringify({ rows: input.rows, finalChunk: input.finalChunk }))
    .digest('hex');
  if (
    existing &&
    (existing.fileDigest !== input.fileDigest ||
      existing.duplicateDecisionDigest !== input.duplicateDecisionDigest)
  ) {
    throw new Error('CSV batch identity version conflict.');
  }
  const priorDigest = existing?.chunks.get(input.chunkIndex);
  if (priorDigest) {
    if (priorDigest !== chunkDigest) throw new Error('CSV chunk content version conflict.');
    return responseFor(existing!);
  }
  for (const row of input.rows) {
    const suspected = repository.transactions.some(
      (item) =>
        item.accountId === input.accountId &&
        item.id !== `${input.batchId}:${row.ordinal}` &&
        item.amountMinor === row.amountMinor &&
        item.effectiveAt === row.transactedAt &&
        item.description === row.description,
    );
    if (suspected && row.duplicateDisposition !== 'included-after-review') {
      throw new Error(`Duplicate review is required for CSV row ${row.ordinal}.`);
    }
  }

  const batch: MemoryCsvBatch = existing ?? {
    id: input.batchId,
    accountId: input.accountId,
    fileDigest: input.fileDigest,
    duplicateDecisionDigest: input.duplicateDecisionDigest,
    status: 'staged',
    chunks: new Map(),
    counts: {
      accepted: 0,
      committed: 0,
      failed: 0,
      suspectedDuplicates: input.duplicateReviewSummary.suspected,
      includedDuplicates: input.duplicateReviewSummary.included,
      excludedDuplicates: input.duplicateReviewSummary.excluded,
    },
    failedOrdinals: [],
  };
  if (batch.duplicateDecisionDigest !== input.duplicateDecisionDigest) {
    throw new Error('CSV duplicate decisions changed during commit.');
  }
  repository.csvFileReceipts.set(fileKey, input.batchId);
  for (const row of input.rows) {
    const identity = `${input.batchId}:${row.ordinal}`;
    const receiptKey = `${input.accountId}:${identity}`;
    if (repository.csvRowReceipts.get(receiptKey) === 'committed') continue;
    if (!Number.isSafeInteger(row.amountMinor) || !row.description.trim()) {
      repository.csvRowReceipts.set(receiptKey, 'failed');
      continue;
    }
    const account = repository.accounts.get(input.accountId);
    try {
      repository.transactions.push(
        createFinancialTransaction({
          id: identity,
          accountId: input.accountId,
          origin: 'csv',
          amountMinor: row.amountMinor,
          currency: account?.currency ?? 'USD',
          transactedAt: row.transactedAt,
          description: row.description,
          pending: false,
          connectedAccount: Boolean(account?.connectionId),
          csvImportBatchId: input.batchId,
          csvRowOrdinal: row.ordinal,
        }),
      );
    } catch {
      repository.csvRowReceipts.set(receiptKey, 'failed');
      continue;
    }
    repository.csvRowReceipts.set(receiptKey, 'committed');
  }

  const prefix = `${input.accountId}:${input.batchId}:`;
  const receipts = [...repository.csvRowReceipts.entries()].filter(([key]) =>
    key.startsWith(prefix),
  );
  batch.counts.accepted = receipts.length;
  batch.counts.committed = receipts.filter(([, state]) => state === 'committed').length;
  batch.counts.failed = receipts.filter(([, state]) => state === 'failed').length;
  batch.failedOrdinals = receipts
    .filter(([, state]) => state === 'failed')
    .map(([key]) => Number(key.slice(prefix.length)))
    .sort((left, right) => left - right);
  batch.chunks.set(input.chunkIndex, chunkDigest);
  if (input.finalChunk) batch.finalChunkIndex = input.chunkIndex;
  const complete =
    batch.finalChunkIndex !== undefined &&
    Array.from({ length: batch.finalChunkIndex + 1 }, (_, index) => index).every((index) =>
      batch.chunks.has(index),
    );
  batch.status = complete ? (batch.counts.failed ? 'partial' : 'succeeded') : 'committing';
  repository.csvBatches.set(batchKey, batch);
  const account = repository.accounts.get(input.accountId);
  if (account && !account.connectionId) {
    const currentBalanceMinor = deriveCurrentBalance(
      repository.balanceSnapshots.filter((snapshot) => snapshot.accountId === account.id),
      repository.transactions.filter((transaction) => transaction.accountId === account.id),
    );
    const updated =
      currentBalanceMinor === account.currentBalanceMinor
        ? account
        : { ...account, currentBalanceMinor, version: account.version + 1 };
    repository.accounts.set(account.id, updated);
    if (updated !== account)
      repository.feedChanges.push({
        audience: financeAudience(account.scope),
        entityType: 'financeAccount',
        entityId: account.id,
        version: updated.version,
        changedAt: new Date().toISOString(),
        operation: 'upsert',
        payload: updated,
      });
  }
  return responseFor(batch);
}

export async function commitAuthorizedCsvImportChunk(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: CsvCommitChunk,
) {
  const account = repository.accounts.get(input.accountId);
  if (!account || !authorizeFinanceScope(actor, account.scope, 'edit').allowed) {
    throw new Error('Finance record not found.');
  }
  return commitCsvImportChunk(repository, input);
}
