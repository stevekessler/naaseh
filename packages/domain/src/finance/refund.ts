import { z } from 'zod';
import { ulidSchema } from '../primitives.js';
import type { FinancialTransaction } from './transaction.js';
import type { BudgetItem } from './budget.js';
import { addMinorUnits, currencyExponentFor } from './money.js';

export const refundedAllocationSchema = z
  .object({
    originalAllocationId: z.string().min(1).max(100),
    amountMinor: z.number().int().safe().positive(),
    categoryId: ulidSchema.optional(),
    subcategoryId: ulidSchema.optional(),
    budgetId: ulidSchema.optional(),
    budgetItemId: ulidSchema.optional(),
    originalAllocationRevision: z.number().int().positive(),
  })
  .strict();

export const expenseRefundRelationshipSchema = z
  .object({
    id: ulidSchema,
    refundTransactionId: ulidSchema,
    originalExpenseTransactionId: ulidSchema,
    linkedAmountMinor: z.number().int().safe().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    currencyExponent: z.number().int().min(0).max(4),
    refundedAllocations: z.array(refundedAllocationSchema).min(1).max(100),
    refundSourceVersion: z.number().int().positive(),
    originalSourceVersion: z.number().int().positive(),
    status: z.enum(['active', 'removed']),
    calculationState: z.enum(['valid', 'awaiting-posting', 'needs-review']),
    createdBy: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    version: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.refundedAllocations.map((a) => a.originalAllocationId);
    let sum: number | undefined;
    try {
      sum = addMinorUnits(value.refundedAllocations.map((a) => a.amountMinor));
    } catch {
      /* Report schema failure below. */
    }
    if (new Set(ids).size !== ids.length || sum !== value.linkedAmountMinor)
      context.addIssue({
        code: 'custom',
        message: 'Refund allocations must be unique and sum to linked amount.',
      });
    if (
      value.refundTransactionId === value.originalExpenseTransactionId ||
      currencyExponentFor(value.currency) !== value.currencyExponent
    )
      context.addIssue({ code: 'custom', message: 'Invalid refund source or currency.' });
  });
export type ExpenseRefundRelationship = z.infer<typeof expenseRefundRelationshipSchema>;
export type RefundedAllocation = z.infer<typeof refundedAllocationSchema>;

export function originalRefundPrincipal(original: FinancialTransaction) {
  if (
    !Number.isSafeInteger(original.amountMinor) ||
    original.amountMinor >= 0 ||
    original.transferId ||
    original.status !== 'active'
  )
    throw new Error('Refund original must be an active expense, not income or a transfer.');
  if (!original.allocations.length)
    return [{ id: `unallocated:${original.id}`, amountMinor: -original.amountMinor }];
  if (
    addMinorUnits(original.allocations.map((a) => a.amountMinor)) !== original.amountMinor ||
    original.allocations.some((a) => a.amountMinor >= 0) ||
    new Set(original.allocations.map((a) => a.id)).size !== original.allocations.length
  )
    throw new Error('Original allocation principal requires review.');
  return original.allocations.map((a) => ({ id: a.id, amountMinor: -a.amountMinor }));
}

/** Include awaiting-posting/review claims: they still reserve capacity until explicitly removed. */
export function refundCapacity(
  original: FinancialTransaction,
  relationships: readonly ExpenseRefundRelationship[],
) {
  const principal = originalRefundPrincipal(original);
  const active = relationships.filter(
    (r) => r.status === 'active' && r.originalExpenseTransactionId === original.id,
  );
  const allocations = principal.map((p) => {
    const claimedMinor = addMinorUnits(
      active.flatMap((r) =>
        r.refundedAllocations
          .filter((a) => a.originalAllocationId === p.id)
          .map((a) => a.amountMinor),
      ),
    );
    if (claimedMinor > p.amountMinor) throw new Error('Original allocation capacity exceeded.');
    return {
      originalAllocationId: p.id,
      principalMinor: p.amountMinor,
      claimedMinor,
      remainingMinor: p.amountMinor - claimedMinor,
    };
  });
  const claimedMinor = addMinorUnits(allocations.map((a) => a.claimedMinor));
  return {
    principalMinor: -original.amountMinor,
    claimedMinor,
    remainingMinor: -original.amountMinor - claimedMinor,
    allocations,
  };
}

export function isPostedSpendSource(transaction: FinancialTransaction): boolean {
  return (
    transaction.status === 'active' &&
    Boolean(transaction.postedAt) &&
    !transaction.pending &&
    !transaction.transferId &&
    transaction.reviewState === 'none' &&
    transaction.reconciliationState !== 'provisional' &&
    transaction.reconciliationState !== 'review-required'
  );
}

export interface CreateExpenseRefundInput {
  id: string;
  original: FinancialTransaction;
  refund: FinancialTransaction;
  linkedAmountMinor: number;
  refundedAllocations?:
    | readonly { originalAllocationId: string; amountMinor: number }[]
    | undefined;
  confirmedPartialAllocations: boolean;
  existing: readonly ExpenseRefundRelationship[];
  budgetItems?: readonly BudgetItem[];
  actorId: string;
  now?: Date;
}

/** Pure validation/snapshot building. The persistence layer must conditionally reserve both ledgers. */
export function createExpenseRefundRelationship(
  input: CreateExpenseRefundInput,
): ExpenseRefundRelationship {
  const { original, refund, linkedAmountMinor, existing } = input;
  const principal = originalRefundPrincipal(original);
  if (
    original.id === refund.id ||
    original.currency !== refund.currency ||
    original.currencyExponent !== refund.currencyExponent ||
    refund.transferId ||
    refund.status !== 'active' ||
    !Number.isSafeInteger(refund.amountMinor) ||
    refund.amountMinor <= 0 ||
    !Number.isSafeInteger(linkedAmountMinor) ||
    linkedAmountMinor <= 0 ||
    linkedAmountMinor > refund.amountMinor
  )
    throw new Error('Invalid refund credit, currency or capacity.');
  if (existing.some((r) => r.status === 'active' && r.refundTransactionId === refund.id))
    throw new Error('This credit already has one original expense relationship.');
  if (existing.some((r) => r.status === 'active' && r.refundTransactionId === original.id))
    throw new Error('A refund cannot be the original of another refund.');
  const partial = linkedAmountMinor !== -original.amountMinor;
  if (partial && original.allocations.length > 1 && !input.confirmedPartialAllocations)
    throw new Error('Confirm original allocation amounts for a partial split refund.');
  const proposed =
    input.refundedAllocations ??
    (partial
      ? original.allocations.length <= 1
        ? [{ originalAllocationId: principal[0]!.id, amountMinor: linkedAmountMinor }]
        : []
      : principal.map((p) => ({ originalAllocationId: p.id, amountMinor: p.amountMinor })));
  if (!proposed.length || addMinorUnits(proposed.map((a) => a.amountMinor)) !== linkedAmountMinor)
    throw new Error('Refund allocations must sum to the linked amount.');
  const capacity = refundCapacity(original, existing);
  const seen = new Set<string>();
  const refundedAllocations = proposed.map((a) => {
    const available = capacity.allocations.find(
      (p) => p.originalAllocationId === a.originalAllocationId,
    );
    if (
      !available ||
      seen.has(a.originalAllocationId) ||
      !Number.isSafeInteger(a.amountMinor) ||
      a.amountMinor <= 0 ||
      a.amountMinor > available.remainingMinor
    )
      throw new Error('Invalid, repeated or exceeded original allocation capacity.');
    seen.add(a.originalAllocationId);
    const source = original.allocations.find((p) => p.id === a.originalAllocationId);
    const item = source?.budgetItemId
      ? input.budgetItems?.find((p) => p.id === source.budgetItemId)
      : undefined;
    const subcategoryId =
      source && 'subcategoryId' in source && typeof source.subcategoryId === 'string'
        ? source.subcategoryId
        : undefined;
    return {
      ...a,
      originalAllocationRevision: original.version,
      ...(source ? { categoryId: source.financeCategoryId } : {}),
      ...(subcategoryId ? { subcategoryId } : {}),
      ...(source?.budgetItemId ? { budgetItemId: source.budgetItemId } : {}),
      ...(item ? { budgetId: item.budgetId } : {}),
    };
  });
  const timestamp = (input.now ?? new Date()).toISOString();
  const awaiting = !isPostedSpendSource(original) || !isPostedSpendSource(refund);
  return expenseRefundRelationshipSchema.parse({
    id: input.id,
    refundTransactionId: refund.id,
    originalExpenseTransactionId: original.id,
    linkedAmountMinor,
    currency: refund.currency,
    currencyExponent: refund.currencyExponent,
    refundedAllocations,
    refundSourceVersion: refund.version,
    originalSourceVersion: original.version,
    status: 'active',
    calculationState: awaiting ? 'awaiting-posting' : 'valid',
    createdBy: input.actorId,
    createdAt: timestamp,
    updatedAt: timestamp,
    version: 1,
  });
}

/** Recategorization preserves snapshots; loss of principal/posting invalidates contribution. */
export function canContributeRefund(
  relationship: ExpenseRefundRelationship,
  refund: FinancialTransaction,
  original: FinancialTransaction,
): boolean {
  if (
    relationship.status !== 'active' ||
    relationship.calculationState !== 'valid' ||
    relationship.refundTransactionId !== refund.id ||
    relationship.originalExpenseTransactionId !== original.id ||
    !isPostedSpendSource(refund) ||
    !isPostedSpendSource(original) ||
    refund.currency !== relationship.currency ||
    original.currency !== relationship.currency ||
    refund.currencyExponent !== relationship.currencyExponent ||
    original.currencyExponent !== relationship.currencyExponent ||
    refund.amountMinor < relationship.linkedAmountMinor
  )
    return false;
  try {
    expenseRefundRelationshipSchema.parse(relationship);
    refundCapacity(original, [relationship]);
    const ids = new Set(originalRefundPrincipal(original).map((p) => p.id));
    return relationship.refundedAllocations.every((a) => ids.has(a.originalAllocationId));
  } catch {
    return false;
  }
}
