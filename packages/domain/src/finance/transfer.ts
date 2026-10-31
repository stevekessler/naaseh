import type { FinanceScope } from './scope.js';
import type { FinancialTransaction } from './transaction.js';

export interface FinanceTransfer {
  id: string;
  scope: FinanceScope;
  legTransactionIds: string[];
  status: 'suggested' | 'confirmed' | 'broken' | 'archived';
  createdBy: string;
  version: number;
}

function assertCompatibleTransferLegs(legs: readonly FinancialTransaction[]) {
  if (
    legs.length < 2 ||
    legs.length > 10 ||
    new Set(legs.map(({ id }) => id)).size !== legs.length
  ) {
    throw new Error('A transfer requires 2–10 distinct legs.');
  }
  if (new Set(legs.map(({ currency }) => currency)).size !== 1)
    throw new Error('Transfer legs must use one currency.');
  if (legs.reduce((sum, leg) => sum + leg.amountMinor, 0) !== 0)
    throw new Error('Transfer legs must net to zero.');
}

export function createSuggestedTransfer(
  input: { id: string; scope: FinanceScope; createdBy: string },
  legs: readonly FinancialTransaction[],
): FinanceTransfer {
  assertCompatibleTransferLegs(legs);
  return {
    id: input.id,
    scope: input.scope,
    legTransactionIds: legs.map(({ id }) => id),
    status: 'suggested',
    createdBy: input.createdBy,
    version: 1,
  };
}

export function createConfirmedTransfer(
  input: { id: string; scope: FinanceScope; createdBy: string },
  legs: readonly FinancialTransaction[],
): FinanceTransfer {
  assertCompatibleTransferLegs(legs);
  return {
    id: input.id,
    scope: input.scope,
    legTransactionIds: legs.map(({ id }) => id),
    status: 'confirmed',
    createdBy: input.createdBy,
    version: 1,
  };
}

export function confirmTransfer(
  transfer: FinanceTransfer,
  legs: readonly FinancialTransaction[],
): FinanceTransfer {
  if (transfer.status !== 'suggested' && transfer.status !== 'broken') {
    throw new Error('Only suggested or broken transfers can be confirmed.');
  }
  assertCompatibleTransferLegs(legs);
  const ids = legs.map(({ id }) => id);
  if (
    ids.some((id) => !transfer.legTransactionIds.includes(id)) ||
    transfer.legTransactionIds.some((id) => !ids.includes(id))
  ) {
    throw new Error('Transfer legs do not match the suggestion.');
  }
  return { ...transfer, status: 'confirmed', version: transfer.version + 1 };
}

export function invalidateTransfer(transfer: FinanceTransfer): FinanceTransfer {
  return transfer.status === 'confirmed'
    ? { ...transfer, status: 'broken', version: transfer.version + 1 }
    : transfer;
}

export function archiveTransfer(transfer: FinanceTransfer): FinanceTransfer {
  return transfer.status === 'archived'
    ? transfer
    : { ...transfer, status: 'archived', version: transfer.version + 1 };
}
