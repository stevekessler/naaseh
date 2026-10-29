import { createUlid } from '@naaseh/domain';
import { encryptText } from '../../../crypto/vault.js';
import {
  encryptFinanceRecord,
  putFinanceRecordWithMutation,
} from '../../../db/finance-repository.js';

export type DuplicateDecision = 'include' | 'exclude';
export interface DuplicateCandidate {
  ordinal: number;
  date: string;
  amountMinor: number;
  description: string;
}

export interface CsvMappingState {
  dateColumn: string;
  descriptionColumn: string;
  dateFormat: 'YYYY-MM-DD' | 'MM/DD/YYYY' | 'M/D/YYYY';
  amountMapping:
    | { mode: 'signed'; amountColumn: string }
    | { mode: 'debit-credit'; debitColumn: string; creditColumn: string };
  payeeColumn?: string;
  memoColumn?: string;
}

/** Plaintext preview rows stay in this in-memory repository and never enter IndexedDB. */
export class LocalCsvPreviewRepository<T> {
  #rows: readonly T[] = [];
  set(rows: readonly T[]) {
    this.#rows = [...rows];
  }
  read() {
    return this.#rows;
  }
  clear() {
    this.#rows = [];
  }
}

export class DuplicateReview {
  readonly #decisions = new Map<number, DuplicateDecision>();
  constructor(readonly candidates: readonly DuplicateCandidate[]) {}
  get current() {
    return this.candidates.find((candidate) => !this.#decisions.has(candidate.ordinal));
  }
  decide(ordinal: number, decision: DuplicateDecision) {
    if (!this.candidates.some((candidate) => candidate.ordinal === ordinal))
      throw new Error('Unknown duplicate candidate.');
    this.#decisions.set(ordinal, decision);
  }
  get complete() {
    return this.#decisions.size === this.candidates.length;
  }
  summary() {
    return {
      suspected: this.candidates.length,
      included: [...this.#decisions.values()].filter((value) => value === 'include').length,
      excluded: [...this.#decisions.values()].filter((value) => value === 'exclude').length,
      unresolved: this.candidates.length - this.#decisions.size,
    };
  }
}

export function chunkReviewedRows<T>(rows: readonly T[], size = 100): T[][] {
  if (size < 1 || size > 100) throw new Error('CSV chunk size must be between 1 and 100.');
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
    rows.slice(index * size, (index + 1) * size),
  );
}

export async function queueEncryptedCsvChunks(input: {
  accountId: string;
  batchId: string;
  scopeKey: string;
  rows: readonly unknown[];
  key: CryptoKey;
  createdAt?: string;
}) {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const chunks = chunkReviewedRows(input.rows);
  for (const [chunkIndex, rows] of chunks.entries()) {
    const entityId = `${input.batchId}:${chunkIndex}`;
    const mutationId = createUlid();
    const record = await encryptFinanceRecord({
      id: entityId,
      entityType: 'financeCsvChunk',
      scopeKey: input.scopeKey,
      accountId: input.accountId,
      version: 1,
      updatedAt: createdAt,
      value: {
        batchId: input.batchId,
        chunkIndex,
        finalChunk: chunkIndex === chunks.length - 1,
        rows,
      },
      key: input.key,
    });
    const payload = await encryptText(
      JSON.stringify({
        batchId: input.batchId,
        chunkIndex,
        finalChunk: chunkIndex === chunks.length - 1,
        rows,
      }),
      input.key,
      `mutation:${mutationId}`,
    );
    await putFinanceRecordWithMutation(record, {
      id: mutationId,
      entityId,
      entityType: 'financeTransaction',
      operation: 'commitCsvChunk',
      baseVersion: 0,
      payload,
      createdAt,
      attempts: 0,
    });
  }
  return chunks.length;
}
