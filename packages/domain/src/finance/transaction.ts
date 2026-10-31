import { currencyExponentFor } from './money.js';
import {
  createBalancedAllocations,
  type TransactionAllocation,
  type TransactionAllocationInput,
} from './allocation.js';

export type FinancialTransactionOrigin = 'simplefin' | 'manual' | 'csv';
export interface TransactionSnapshot {
  postedAt?: string;
  transactedAt?: string;
  amountMinor: number;
  currency: string;
  description: string;
  payee?: string;
  memo?: string;
  pending: boolean;
  merchantCategoryCode?: string;
}

export interface FinancialTransaction {
  id: string;
  accountId: string;
  origin: FinancialTransactionOrigin;
  csvImportBatchId?: string;
  csvRowOrdinal?: number;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  postedAt?: string;
  transactedAt?: string;
  effectiveAt: string;
  description: string;
  payee?: string;
  memo?: string;
  pending: boolean;
  merchantCategoryCode?: string;
  merchantId?: string;
  providerConnectionId?: string;
  providerAccountId?: string;
  sourceTransactionId?: string;
  entrySnapshot?: TransactionSnapshot;
  providerSnapshot?: TransactionSnapshot;
  allocations: TransactionAllocation[];
  transferId?: string;
  reconciliationState:
    | 'not-applicable'
    | 'provisional'
    | 'reconciled'
    | 'review-required'
    | 'kept-separate';
  reconciledAt?: string;
  reconciledBy?: string;
  reviewState:
    | 'none'
    | 'identity-review'
    | 'allocation-review'
    | 'reconciliation-review'
    | 'possible-duplicate';
  status: 'active' | 'archived' | 'tombstone';
  version: number;
}

export interface CreateFinancialTransactionInput {
  id: string;
  accountId: string;
  origin: FinancialTransactionOrigin;
  amountMinor: number;
  currency: string;
  postedAt?: string;
  transactedAt?: string;
  description: string;
  payee?: string;
  memo?: string;
  pending: boolean;
  connectedAccount: boolean;
  providerConnectionId?: string;
  providerAccountId?: string;
  sourceTransactionId?: string;
  csvImportBatchId?: string;
  csvRowOrdinal?: number;
  merchantId?: string;
}

const instant = (value: string | undefined) =>
  value === undefined ? undefined : new Date(value).toISOString();

export function createFinancialTransaction(
  input: CreateFinancialTransactionInput,
): FinancialTransaction {
  if (!Number.isSafeInteger(input.amountMinor))
    throw new Error('Transaction amount must be a safe integer.');
  const description = input.description.trim();
  if (!description || description.length > 1_000)
    throw new Error('Transaction description is required.');
  if (!input.postedAt && !input.transactedAt) throw new Error('A transaction date is required.');
  const postedAt = instant(input.postedAt);
  const transactedAt = instant(input.transactedAt);
  const snapshot: TransactionSnapshot = {
    amountMinor: input.amountMinor,
    currency: input.currency,
    description,
    pending: input.pending,
    ...(postedAt ? { postedAt } : {}),
    ...(transactedAt ? { transactedAt } : {}),
    ...(input.payee ? { payee: input.payee } : {}),
    ...(input.memo ? { memo: input.memo } : {}),
  };
  const provider = input.origin === 'simplefin';
  if (
    provider &&
    (!input.providerConnectionId || !input.providerAccountId || !input.sourceTransactionId)
  ) {
    throw new Error('SimpleFIN transactions require provider identity.');
  }
  return {
    id: input.id,
    accountId: input.accountId,
    origin: input.origin,
    ...(input.csvImportBatchId ? { csvImportBatchId: input.csvImportBatchId } : {}),
    ...(input.csvRowOrdinal === undefined ? {} : { csvRowOrdinal: input.csvRowOrdinal }),
    amountMinor: input.amountMinor,
    currency: input.currency,
    currencyExponent: currencyExponentFor(input.currency),
    ...(postedAt ? { postedAt } : {}),
    ...(transactedAt ? { transactedAt } : {}),
    effectiveAt: postedAt ?? transactedAt!,
    description,
    ...(input.payee ? { payee: input.payee } : {}),
    ...(input.memo ? { memo: input.memo } : {}),
    pending: input.pending,
    ...(input.providerConnectionId ? { providerConnectionId: input.providerConnectionId } : {}),
    ...(input.providerAccountId ? { providerAccountId: input.providerAccountId } : {}),
    ...(input.sourceTransactionId ? { sourceTransactionId: input.sourceTransactionId } : {}),
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    ...(provider ? { providerSnapshot: snapshot } : { entrySnapshot: snapshot }),
    allocations: [],
    reconciliationState:
      input.origin === 'manual' && input.connectedAccount ? 'provisional' : 'not-applicable',
    reviewState: 'none',
    status: 'active',
    version: 1,
  };
}

export function replaceTransactionAllocations(
  transaction: FinancialTransaction,
  values: readonly TransactionAllocationInput[],
  actorId: string,
  now = new Date(),
): FinancialTransaction {
  return {
    ...transaction,
    allocations: createBalancedAllocations(transaction.amountMinor, values, actorId, now),
    reviewState: 'none',
    version: transaction.version + 1,
  };
}

export interface TransactionCorrection {
  postedAt?: string | null;
  transactedAt?: string;
  amountMinor?: number;
  description?: string;
  payee?: string;
  memo?: string;
  pending?: boolean;
  source?: 'entry' | 'provider';
}

export function correctFinancialTransaction(
  transaction: FinancialTransaction,
  correction: TransactionCorrection,
): FinancialTransaction {
  if (transaction.status !== 'active')
    throw new Error('Only active transactions can be corrected.');
  const source = correction.source ?? (transaction.origin === 'simplefin' ? 'provider' : 'entry');
  const currentSnapshot =
    source === 'provider' ? transaction.providerSnapshot : transaction.entrySnapshot;
  if (!currentSnapshot) throw new Error(`The transaction has no ${source} source snapshot.`);
  const amountMinor = correction.amountMinor ?? currentSnapshot.amountMinor;
  if (!Number.isSafeInteger(amountMinor))
    throw new Error('Transaction amount must be a safe integer.');
  const description = correction.description?.trim() ?? currentSnapshot.description;
  if (!description || description.length > 1_000)
    throw new Error('Transaction description is required.');
  const postedAt =
    correction.postedAt === null
      ? undefined
      : instant(correction.postedAt ?? currentSnapshot.postedAt);
  const transactedAt = instant(correction.transactedAt ?? currentSnapshot.transactedAt);
  if (!postedAt && !transactedAt) throw new Error('A transaction date is required.');
  const snapshot: TransactionSnapshot = {
    ...currentSnapshot,
    amountMinor,
    description,
    pending: correction.pending ?? currentSnapshot.pending,
    ...(postedAt ? { postedAt } : {}),
    ...(transactedAt ? { transactedAt } : {}),
    ...(correction.payee === undefined ? {} : { payee: correction.payee }),
    ...(correction.memo === undefined ? {} : { memo: correction.memo }),
  };
  if (!postedAt) delete snapshot.postedAt;
  const projected = source === 'provider' || !transaction.providerSnapshot;
  const allocationTotal = transaction.allocations.reduce(
    (sum, allocation) => sum + allocation.amountMinor,
    0,
  );
  const allocationsInvalid = transaction.allocations.length > 0 && allocationTotal !== amountMinor;
  const corrected: FinancialTransaction = {
    ...transaction,
    ...(source === 'provider' ? { providerSnapshot: snapshot } : { entrySnapshot: snapshot }),
    ...(projected
      ? {
          amountMinor,
          description,
          pending: snapshot.pending,
          ...(postedAt ? { postedAt } : {}),
          ...(transactedAt ? { transactedAt } : {}),
          effectiveAt: postedAt ?? transactedAt!,
          ...(snapshot.payee === undefined ? {} : { payee: snapshot.payee }),
          ...(snapshot.memo === undefined ? {} : { memo: snapshot.memo }),
        }
      : {}),
    reviewState: allocationsInvalid ? 'allocation-review' : transaction.reviewState,
    version: transaction.version + 1,
  };
  if (projected && !postedAt) delete corrected.postedAt;
  return corrected;
}

export function canPermanentlyDeleteTransaction(
  transaction: FinancialTransaction,
  impact: { hasReferences: boolean; isMistake: boolean },
) {
  return (
    transaction.status === 'active' &&
    transaction.origin !== 'simplefin' &&
    !impact.hasReferences &&
    impact.isMistake
  );
}

export function archiveFinancialTransaction(
  transaction: FinancialTransaction,
): FinancialTransaction {
  if (transaction.status === 'tombstone') throw new Error('A tombstone cannot be archived.');
  return { ...transaction, status: 'archived', version: transaction.version + 1 };
}

export function tombstoneFinancialTransaction(
  transaction: FinancialTransaction,
): FinancialTransaction {
  const tombstone: FinancialTransaction = {
    ...transaction,
    description: 'Deleted transaction',
    allocations: [],
    reviewState: 'none',
    status: 'tombstone',
    version: transaction.version + 1,
  };
  delete tombstone.entrySnapshot;
  delete tombstone.providerSnapshot;
  delete tombstone.payee;
  delete tombstone.memo;
  delete tombstone.merchantId;
  delete tombstone.transferId;
  return tombstone;
}
