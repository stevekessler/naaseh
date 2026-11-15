import { z } from 'zod';
import { ulidSchema } from '../primitives.js';
import { currencyExponentFor } from './money.js';
import { isFinanceDate, localFinanceDate } from './spend.js';
import type { ExpenseFulfillment } from './expense-fulfillment.js';

export const upcomingExpenseEntryContextSchema = z
  .object({
    enteredAt: z.string().datetime(),
    localDate: z.string().refine(isFinanceDate),
    timeZone: z.string().min(1).max(100),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      if (localFinanceDate(value.enteredAt, value.timeZone) !== value.localDate)
        context.addIssue({
          code: 'custom',
          message: 'Local date must match the entry instant and time zone.',
        });
    } catch {
      context.addIssue({ code: 'custom', message: 'Invalid entry time zone.' });
    }
  });

export const upcomingExpensePlannedSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('budgetItem'), budgetItemId: ulidSchema }).strict(),
  z
    .object({
      type: z.literal('reusableOccurrence'),
      reusableItemId: ulidSchema,
      occurrenceDate: z.string().refine(isFinanceDate),
    })
    .strict(),
]);

export const upcomingExpenseDateChangeSchema = z
  .object({
    previousDueDate: z.string().refine(isFinanceDate),
    dueDate: z.string().refine(isFinanceDate),
    context: upcomingExpenseEntryContextSchema,
    changedBy: z.string().min(1).max(200),
    changedAt: z.string().datetime(),
  })
  .strict();

export const upcomingExpenseSchema = z
  .object({
    id: ulidSchema,
    groupId: ulidSchema,
    accountId: ulidSchema,
    budgetId: ulidSchema,
    description: z.string().min(1).max(500),
    expectedAmountMinor: z.number().int().safe().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/u),
    currencyExponent: z.number().int().min(0).max(6),
    dueDate: z.string().refine(isFinanceDate),
    entryContext: upcomingExpenseEntryContextSchema,
    dateChangeHistory: z.array(upcomingExpenseDateChangeSchema).max(1_000),
    plannedSource: upcomingExpensePlannedSourceSchema.optional(),
    lifecycle: z.enum(['active', 'cancelled']),
    creatorId: z.string().min(1).max(200),
    acceptedAt: z.string().datetime(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    cancelledAt: z.string().datetime().optional(),
    cancelledBy: z.string().min(1).max(200).optional(),
    version: z.number().int().positive(),
  })
  .strict();

export type UpcomingExpenseEntryContext = z.infer<typeof upcomingExpenseEntryContextSchema>;
export type UpcomingExpensePlannedSource = z.infer<typeof upcomingExpensePlannedSourceSchema>;
export type UpcomingExpenseDateChange = z.infer<typeof upcomingExpenseDateChangeSchema>;
export type UpcomingExpense = z.infer<typeof upcomingExpenseSchema>;

export interface CreateUpcomingExpenseInput {
  id: string;
  groupId: string;
  accountId: string;
  budgetId: string;
  description: string;
  expectedAmountMinor: number;
  currency: string;
  dueDate: string;
  entryContext: UpcomingExpenseEntryContext;
  plannedSource?: UpcomingExpensePlannedSource;
  creatorId: string;
  acceptedAt?: string;
}

const timestamp = (value: string | undefined) => new Date(value ?? Date.now()).toISOString();

function description(value: string) {
  const normalized = value.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (!normalized || normalized.length > 500)
    throw new Error('Upcoming expense description must be 1–500 characters.');
  return normalized;
}

function validateFutureDate(dueDate: string, context: UpcomingExpenseEntryContext) {
  upcomingExpenseEntryContextSchema.parse(context);
  if (!isFinanceDate(dueDate))
    throw new Error('Upcoming expense due date must be a calendar date.');
  if (dueDate <= context.localDate)
    throw new Error('Upcoming expense due date must be after the original local date.');
}

export function createUpcomingExpense(input: CreateUpcomingExpenseInput): UpcomingExpense {
  validateFutureDate(input.dueDate, input.entryContext);
  if (!Number.isSafeInteger(input.expectedAmountMinor) || input.expectedAmountMinor <= 0)
    throw new Error('Upcoming expense expected amount must be a positive safe integer.');
  const acceptedAt = timestamp(input.acceptedAt);
  return upcomingExpenseSchema.parse({
    id: input.id,
    groupId: input.groupId,
    accountId: input.accountId,
    budgetId: input.budgetId,
    description: description(input.description),
    expectedAmountMinor: input.expectedAmountMinor,
    currency: input.currency,
    currencyExponent: currencyExponentFor(input.currency),
    dueDate: input.dueDate,
    entryContext: input.entryContext,
    dateChangeHistory: [],
    ...(input.plannedSource ? { plannedSource: input.plannedSource } : {}),
    lifecycle: 'active',
    creatorId: input.creatorId,
    acceptedAt,
    createdAt: acceptedAt,
    updatedAt: acceptedAt,
    version: 1,
  });
}

export function plannedSourceIdentity(source: UpcomingExpensePlannedSource): string {
  return source.type === 'budgetItem'
    ? `budgetItem:${source.budgetItemId}`
    : `reusableOccurrence:${source.reusableItemId}:${source.occurrenceDate}`;
}

export function editUpcomingExpense(
  expense: UpcomingExpense,
  input: {
    description?: string;
    expectedAmountMinor?: number;
    groupId?: string;
    accountId?: string;
    budgetId?: string;
    plannedSource?: UpcomingExpensePlannedSource | null;
  },
  now = new Date(),
): UpcomingExpense {
  upcomingExpenseSchema.parse(expense);
  if (expense.lifecycle !== 'active')
    throw new Error('Cancelled upcoming expenses must be explicitly reopened.');
  const expectedAmountMinor = input.expectedAmountMinor ?? expense.expectedAmountMinor;
  if (!Number.isSafeInteger(expectedAmountMinor) || expectedAmountMinor <= 0)
    throw new Error('Upcoming expense expected amount must be a positive safe integer.');
  const updated: UpcomingExpense = {
    ...expense,
    ...(input.description === undefined ? {} : { description: description(input.description) }),
    expectedAmountMinor,
    groupId: input.groupId ?? expense.groupId,
    accountId: input.accountId ?? expense.accountId,
    budgetId: input.budgetId ?? expense.budgetId,
    updatedAt: now.toISOString(),
    version: expense.version + 1,
  };
  if (input.plannedSource === null) delete updated.plannedSource;
  else if (input.plannedSource !== undefined) updated.plannedSource = input.plannedSource;
  return upcomingExpenseSchema.parse(updated);
}

export function rescheduleUpcomingExpense(
  expense: UpcomingExpense,
  dueDate: string,
  context: UpcomingExpenseEntryContext,
  actorId: string,
): UpcomingExpense {
  upcomingExpenseSchema.parse(expense);
  validateFutureDate(dueDate, context);
  if (expense.lifecycle !== 'active')
    throw new Error('Cancelled upcoming expenses must be explicitly reopened.');
  const changedAt = timestamp(context.enteredAt);
  return upcomingExpenseSchema.parse({
    ...expense,
    dueDate,
    dateChangeHistory: [
      ...expense.dateChangeHistory,
      { previousDueDate: expense.dueDate, dueDate, context, changedBy: actorId, changedAt },
    ],
    updatedAt: changedAt,
    version: expense.version + 1,
  });
}

export function cancelUpcomingExpense(
  expense: UpcomingExpense,
  actorId: string,
  now = new Date(),
): UpcomingExpense {
  upcomingExpenseSchema.parse(expense);
  if (expense.lifecycle === 'cancelled') return expense;
  const changedAt = now.toISOString();
  return upcomingExpenseSchema.parse({
    ...expense,
    lifecycle: 'cancelled',
    cancelledAt: changedAt,
    cancelledBy: actorId,
    updatedAt: changedAt,
    version: expense.version + 1,
  });
}

export function reopenUpcomingExpense(
  expense: UpcomingExpense,
  dueDate: string,
  context: UpcomingExpenseEntryContext,
  actorId: string,
): UpcomingExpense {
  upcomingExpenseSchema.parse(expense);
  if (expense.lifecycle !== 'cancelled')
    throw new Error('Only a cancelled expense can be reopened.');
  validateFutureDate(dueDate, context);
  const changedAt = timestamp(context.enteredAt);
  const reopened = {
    ...expense,
    lifecycle: 'active' as const,
    dueDate,
    dateChangeHistory: [
      ...expense.dateChangeHistory,
      { previousDueDate: expense.dueDate, dueDate, context, changedBy: actorId, changedAt },
    ],
    updatedAt: changedAt,
    version: expense.version + 1,
  };
  delete reopened.cancelledAt;
  delete reopened.cancelledBy;
  return upcomingExpenseSchema.parse(reopened);
}

export type UpcomingExpenseDisplayState =
  | 'upcoming'
  | 'due-today'
  | 'overdue'
  | 'partly-paid'
  | 'partly-paid-due-today'
  | 'partly-paid-overdue'
  | 'paid'
  | 'cancelled';

export function deriveUpcomingExpenseState(
  expense: UpcomingExpense,
  fulfillments: readonly ExpenseFulfillment[],
  localDate: string,
): {
  state: UpcomingExpenseDisplayState;
  fulfilledAmountMinor: number;
  remainingAmountMinor: number;
  overpaidAmountMinor: number;
} {
  upcomingExpenseSchema.parse(expense);
  if (!isFinanceDate(localDate)) throw new Error('Viewing local date must be a calendar date.');
  const fulfilledAmountMinor = fulfillments
    .filter(
      (claim) =>
        claim.upcomingExpenseId === expense.id &&
        claim.status === 'active' &&
        claim.calculationState === 'valid',
    )
    .reduce((sum, claim) => {
      const next = sum + claim.amountMinor;
      if (!Number.isSafeInteger(next)) throw new Error('Fulfillment total exceeds safe capacity.');
      return next;
    }, 0);
  const remainingAmountMinor = Math.max(0, expense.expectedAmountMinor - fulfilledAmountMinor);
  const overpaidAmountMinor = Math.max(0, fulfilledAmountMinor - expense.expectedAmountMinor);
  let state: UpcomingExpenseDisplayState;
  if (expense.lifecycle === 'cancelled') state = 'cancelled';
  else if (remainingAmountMinor === 0) state = 'paid';
  else {
    const timing =
      expense.dueDate < localDate
        ? 'overdue'
        : expense.dueDate === localDate
          ? 'due-today'
          : 'upcoming';
    state =
      fulfilledAmountMinor === 0
        ? timing
        : timing === 'upcoming'
          ? 'partly-paid'
          : timing === 'due-today'
            ? 'partly-paid-due-today'
            : 'partly-paid-overdue';
  }
  return { state, fulfilledAmountMinor, remainingAmountMinor, overpaidAmountMinor };
}
