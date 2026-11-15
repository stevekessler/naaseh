import { z } from 'zod';
import { ulidSchema } from '../primitives.js';
import type { FinancialTransaction } from './transaction.js';
import type { UpcomingExpense } from './upcoming-expense.js';

export const expenseFulfillmentSchema = z
  .object({
    id: ulidSchema,
    upcomingExpenseId: ulidSchema,
    transactionId: ulidSchema,
    accountId: ulidSchema,
    currency: z.string().regex(/^[A-Z]{3}$/u),
    currencyExponent: z.number().int().min(0).max(6),
    amountMinor: z.number().int().safe().positive(),
    transactionVersion: z.number().int().positive(),
    calculationState: z.enum(['valid', 'awaiting-posting', 'needs-review']),
    createdBy: z.string().min(1).max(200),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    status: z.enum(['active', 'removed']),
    version: z.number().int().positive(),
  })
  .strict();

export type ExpenseFulfillment = z.infer<typeof expenseFulfillmentSchema>;

function eligibleMagnitude(transaction: FinancialTransaction) {
  if (
    transaction.status !== 'active' ||
    transaction.transferId ||
    !Number.isSafeInteger(transaction.amountMinor) ||
    transaction.amountMinor >= 0
  )
    throw new Error('Fulfillment requires an active expense transaction.');
  return -transaction.amountMinor;
}

function isPosted(transaction: FinancialTransaction) {
  return (
    Boolean(transaction.postedAt) &&
    !transaction.pending &&
    transaction.reviewState === 'none' &&
    transaction.reconciliationState !== 'provisional' &&
    transaction.reconciliationState !== 'review-required'
  );
}

export function expenseFulfillmentCapacity(
  transaction: FinancialTransaction,
  fulfillments: readonly ExpenseFulfillment[],
) {
  const principalMinor = eligibleMagnitude(transaction);
  const claimedMinor = fulfillments
    .filter((claim) => claim.transactionId === transaction.id && claim.status === 'active')
    .reduce((sum, claim) => {
      expenseFulfillmentSchema.parse(claim);
      if (
        claim.accountId !== transaction.accountId ||
        claim.currency !== transaction.currency ||
        claim.currencyExponent !== transaction.currencyExponent
      )
        throw new Error('Fulfillment transaction capacity requires review.');
      const next = sum + claim.amountMinor;
      if (!Number.isSafeInteger(next)) throw new Error('Fulfillment capacity exceeds safe range.');
      return next;
    }, 0);
  if (claimedMinor > principalMinor) throw new Error('Fulfillment transaction capacity exceeded.');
  return { principalMinor, claimedMinor, remainingMinor: principalMinor - claimedMinor };
}

export function createExpenseFulfillment(input: {
  id: string;
  expense: UpcomingExpense;
  transaction: FinancialTransaction;
  amountMinor: number;
  existing: readonly ExpenseFulfillment[];
  actorId: string;
  now?: Date;
}): ExpenseFulfillment {
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0)
    throw new Error('Fulfillment amount must be a positive safe integer.');
  if (
    input.expense.lifecycle !== 'active' ||
    input.expense.accountId !== input.transaction.accountId ||
    input.expense.currency !== input.transaction.currency ||
    input.expense.currencyExponent !== input.transaction.currencyExponent
  )
    throw new Error('Fulfillment account, currency or expense is not eligible.');
  if (
    input.existing.some(
      (claim) =>
        claim.status === 'active' &&
        claim.upcomingExpenseId === input.expense.id &&
        claim.transactionId === input.transaction.id,
    )
  )
    throw new Error('This transaction already fulfills the upcoming expense.');
  const capacity = expenseFulfillmentCapacity(input.transaction, input.existing);
  if (input.amountMinor > capacity.remainingMinor)
    throw new Error('Fulfillment transaction capacity exceeded.');
  const now = (input.now ?? new Date()).toISOString();
  return expenseFulfillmentSchema.parse({
    id: input.id,
    upcomingExpenseId: input.expense.id,
    transactionId: input.transaction.id,
    accountId: input.transaction.accountId,
    currency: input.transaction.currency,
    currencyExponent: input.transaction.currencyExponent,
    amountMinor: input.amountMinor,
    transactionVersion: input.transaction.version,
    calculationState: isPosted(input.transaction) ? 'valid' : 'awaiting-posting',
    createdBy: input.actorId,
    createdAt: now,
    updatedAt: now,
    status: 'active',
    version: 1,
  });
}

export function removeExpenseFulfillment(
  fulfillment: ExpenseFulfillment,
  now = new Date(),
): ExpenseFulfillment {
  expenseFulfillmentSchema.parse(fulfillment);
  if (fulfillment.status === 'removed') return fulfillment;
  return expenseFulfillmentSchema.parse({
    ...fulfillment,
    status: 'removed',
    updatedAt: now.toISOString(),
    version: fulfillment.version + 1,
  });
}
