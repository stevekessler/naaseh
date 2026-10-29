export interface TransactionAllocationInput {
  id: string;
  amountMinor: number;
  financeCategoryId: string;
  budgetItemId?: string;
  note?: string;
}

export interface TransactionAllocation extends TransactionAllocationInput {
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export function createBalancedAllocations(
  transactionAmountMinor: number,
  values: readonly TransactionAllocationInput[],
  actorId: string,
  now: Date,
): TransactionAllocation[] {
  if (
    values.length > 100 ||
    (values.length === 1 && values[0]?.amountMinor !== transactionAmountMinor)
  ) {
    throw new Error('Allocations must equal the transaction total.');
  }
  const ids = new Set<string>();
  let sum = 0;
  for (const value of values) {
    if (ids.has(value.id)) throw new Error('Allocation identifiers must be unique.');
    ids.add(value.id);
    if (!Number.isSafeInteger(value.amountMinor) || value.amountMinor === 0)
      throw new Error('Allocation amounts must be non-zero safe integers.');
    if (Math.sign(value.amountMinor) !== Math.sign(transactionAmountMinor))
      throw new Error('Allocation signs must match the transaction.');
    if (value.note && value.note.length > 1_000)
      throw new Error('Allocation note exceeds 1,000 characters.');
    sum += value.amountMinor;
  }
  if (values.length && sum !== transactionAmountMinor)
    throw new Error('Allocations must equal the transaction total.');
  const timestamp = now.toISOString();
  return values.map((value) => ({
    ...value,
    createdBy: actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
}
