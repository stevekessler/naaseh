import { describe, expect, it } from 'vitest';
import {
  financeExpenseFulfillmentCreateSchema,
  financeUpcomingExpenseCreateSchema,
  financeUpcomingExpenseReopenSchema,
  financeUpcomingExpenseUpdateSchema,
} from '@naaseh/contracts';
import { experienceId } from '../fixtures/finance/experience.js';

const context = {
  enteredAt: '2026-10-31T18:00:00.000Z',
  localDate: '2026-10-31',
  timeZone: 'America/Denver',
};

describe('upcoming expense HTTP contracts', () => {
  it('requires all source references, positive money and immutable original local context', () => {
    expect(
      financeUpcomingExpenseCreateSchema.parse({
        id: experienceId(890),
        description: 'Annual registration',
        expectedAmountMinor: 3_000,
        dueDate: '2026-11-02',
        entryContext: context,
        accountId: experienceId(101),
        budgetId: experienceId(200),
        groupId: experienceId(1),
      }),
    ).toMatchObject({ dueDate: '2026-11-02', entryContext: context });
    expect(() =>
      financeUpcomingExpenseCreateSchema.parse({
        description: 'Invalid date',
        expectedAmountMinor: 0,
        dueDate: '2026-10-31',
        entryContext: context,
      }),
    ).toThrow();
  });

  it('requires separate context for reschedule without permitting entryContext replacement', () => {
    expect(() =>
      financeUpcomingExpenseUpdateSchema.parse({
        dueDate: '2026-11-05',
        expectedVersion: 1,
      }),
    ).toThrow(/context/iu);
    expect(() =>
      financeUpcomingExpenseUpdateSchema.parse({
        entryContext: context,
        expectedVersion: 1,
      }),
    ).toThrow();
  });

  it('requires an explicit future reschedule context when reopening', () => {
    expect(
      financeUpcomingExpenseReopenSchema.parse({
        expectedVersion: 2,
        dueDate: '2026-11-06',
        dateChangeContext: context,
      }),
    ).toMatchObject({ expectedVersion: 2, dueDate: '2026-11-06' });
    expect(() =>
      financeUpcomingExpenseReopenSchema.parse({
        expectedVersion: 2,
        dueDate: context.localDate,
        dateChangeContext: context,
      }),
    ).toThrow();
  });

  it('binds fulfillment to expense, transaction and claim versions', () => {
    expect(
      financeExpenseFulfillmentCreateSchema.parse({
        id: experienceId(891),
        transactionId: experienceId(304),
        amountMinor: 2_000,
        expectedExpenseVersion: 1,
        expectedTransactionVersion: 1,
        expectedClaimVersion: 0,
      }),
    ).toMatchObject({ amountMinor: 2_000, expectedClaimVersion: 0 });
    expect(() =>
      financeExpenseFulfillmentCreateSchema.parse({
        transactionId: experienceId(304),
        amountMinor: -1,
        expectedExpenseVersion: 1,
        expectedTransactionVersion: 1,
        expectedClaimVersion: 0,
      }),
    ).toThrow();
  });
});
