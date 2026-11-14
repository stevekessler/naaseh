import { createHash } from 'node:crypto';
import { FinanceMemoryRepository } from './repository.js';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import {
  createFinancialTransaction,
  createUlid,
  deriveCurrentBalance,
  financeAudience,
  type FinancialTransaction,
} from '@naaseh/domain';

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
    payee?: string | undefined;
    memo?: string | undefined;
    duplicateDisposition?: 'not-suspected' | 'included-after-review';
  }>;
}

type CsvDuplicateComparison = Pick<CsvCommitChunk, 'accountId' | 'rows'> & {
  batchId?: string;
};

export function identifyCsvDuplicateOrdinals(
  transactions: readonly (Pick<
    FinancialTransaction,
    'id' | 'accountId' | 'amountMinor' | 'effectiveAt' | 'description'
  > &
    Partial<Pick<FinancialTransaction, 'origin' | 'csvImportBatchId'>>)[],
  input: CsvDuplicateComparison,
): number[] {
  const key = (amount: number, date: string, description: string) =>
    JSON.stringify([amount, date, description]);
  const remaining = new Set(
    input.rows.map((row) => key(row.amountMinor, row.transactedAt, row.description)),
  );
  const matched = new Set<string>();
  for (const transaction of transactions) {
    if (!remaining.size) break;
    if (transaction.accountId !== input.accountId) continue;
    if (
      input.batchId &&
      transaction.origin === 'csv' &&
      (transaction.csvImportBatchId === input.batchId ||
        transaction.id.startsWith(`${input.batchId}:`))
    )
      continue;
    const identity = key(transaction.amountMinor, transaction.effectiveAt, transaction.description);
    if (remaining.delete(identity)) matched.add(identity);
  }
  return input.rows
    .filter((row) => matched.has(key(row.amountMinor, row.transactedAt, row.description)))
    .map(({ ordinal }) => ordinal);
}

interface MemoryCsvBatch {
  id: string;
  accountId: string;
  fileDigest: string;
  duplicateDecisionDigest: string;
  status: 'staged' | 'committing' | 'partial' | 'succeeded';
  chunks: Set<number>;
  chunkDigests?: Record<number, string>;
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
    .update(JSON.stringify([input.finalChunk, input.rows]))
    .digest('hex');
  const priorChunkDigest = existing?.chunkDigests?.[input.chunkIndex];
  if (
    existing &&
    (existing.fileDigest !== input.fileDigest ||
      existing.duplicateDecisionDigest !== input.duplicateDecisionDigest ||
      (priorChunkDigest !== undefined && priorChunkDigest !== chunkDigest))
  )
    throw new Error('CSV import version conflict.');
  if (existing?.chunks.has(input.chunkIndex)) return responseFor(existing);
  const unreviewed = identifyCsvDuplicateOrdinals(repository.transactions, {
    accountId: input.accountId,
    batchId: input.batchId,
    rows: input.rows.filter((row) => row.duplicateDisposition !== 'included-after-review'),
  })[0];
  if (unreviewed !== undefined) {
    throw new Error(`Duplicate review is required for CSV row ${unreviewed}.`);
  }

  const batch: MemoryCsvBatch = existing ?? {
    id: input.batchId,
    accountId: input.accountId,
    fileDigest: input.fileDigest,
    duplicateDecisionDigest: input.duplicateDecisionDigest,
    status: 'staged',
    chunks: new Set(),
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
  (batch.chunkDigests ??= {})[input.chunkIndex] = chunkDigest;
  repository.csvFileReceipts.set(fileKey, input.batchId);
  let processed = 0;
  for (const row of input.rows) {
    const identity = `${input.batchId}:${row.ordinal}`;
    const receiptKey = `${input.accountId}:${identity}`;
    if (repository.csvRowReceipts.get(receiptKey) === 'committed') continue;
    if (!Number.isSafeInteger(row.amountMinor) || !row.description.trim()) {
      repository.csvRowReceipts.set(receiptKey, 'failed');
    } else {
      const account = repository.accounts.get(input.accountId);
      repository.transactions.push(
        createFinancialTransaction({
          id: createUlid(),
          accountId: input.accountId,
          origin: 'csv',
          amountMinor: row.amountMinor,
          currency: account?.currency ?? 'USD',
          transactedAt: row.transactedAt,
          description: row.description,
          ...(row.payee === undefined ? {} : { payee: row.payee }),
          ...(row.memo === undefined ? {} : { memo: row.memo }),
          pending: false,
          connectedAccount: false,
          csvImportBatchId: input.batchId,
          csvRowOrdinal: row.ordinal,
        }),
      );
      repository.csvRowReceipts.set(receiptKey, 'committed');
    }
    processed += 1;
    if (processed % 20 === 0 && processed < input.rows.length) {
      updateCsvBatch(repository, input, batch, batchKey, false);
      await repository.checkpoint();
    }
  }
  batch.chunks.add(input.chunkIndex);
  updateCsvBatch(repository, input, batch, batchKey, true);
  return responseFor(batch);
}

function updateCsvBatch(
  repository: FinanceMemoryRepository,
  input: CsvCommitChunk,
  batch: MemoryCsvBatch,
  batchKey: string,
  finished: boolean,
) {
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
  batch.status =
    finished && input.finalChunk ? (batch.counts.failed ? 'partial' : 'succeeded') : 'committing';
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
