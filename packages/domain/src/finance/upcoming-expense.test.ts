import { describe, expect, it } from 'vitest';
import {
  cancelUpcomingExpense,
  createUpcomingExpense,
  deriveUpcomingExpenseState,
  plannedSourceIdentity,
  reopenUpcomingExpense,
  rescheduleUpcomingExpense,
} from './upcoming-expense.js';
import { createExpenseFulfillment, expenseFulfillmentCapacity } from './expense-fulfillment.js';
import { createFinancialTransaction } from './transaction.js';

const id = (suffix: string) => `01K00000000000000000000${suffix}`;
const entryContext = {
  enteredAt: '2026-03-08T09:30:00.000Z',
  localDate: '2026-03-08',
  timeZone: 'America/Denver',
};

function expenseInput() {
  return {
    id: id('001'),
    groupId: id('002'),
    accountId: id('003'),
    budgetId: id('004'),
    description: 'Spring insurance premium',
    expectedAmountMinor: 10_000,
    currency: 'USD',
    dueDate: '2026-03-09',
    entryContext,
    creatorId: 'user-1',
    acceptedAt: '2026-03-12T18:00:00.000Z',
  };
}

function expense() {
  return createUpcomingExpense(expenseInput());
}

function payment(overrides: Partial<ReturnType<typeof createFinancialTransaction>> = {}) {
  return {
    ...createFinancialTransaction({
      id: id('010'),
      accountId: id('003'),
      origin: 'manual',
      amountMinor: -6_000,
      currency: 'USD',
      postedAt: '2026-03-10T15:00:00.000Z',
      description: 'Insurance payment',
      pending: false,
      connectedAccount: false,
    }),
    ...overrides,
  };
}

describe('upcoming expense original calendar context', () => {
  it('accepts delayed synchronization unchanged and derives overdue from the viewing day', () => {
    const result = expense();
    expect(result.entryContext).toEqual(entryContext);
    expect(result.dueDate).toBe('2026-03-09');
    expect(result.acceptedAt).toBe('2026-03-12T18:00:00.000Z');
    expect(deriveUpcomingExpenseState(result, [], '2026-03-12')).toMatchObject({
      state: 'overdue',
      remainingAmountMinor: 10_000,
    });
  });

  it('validates the original local day through DST and rejects a non-future original date', () => {
    expect(expense().entryContext.timeZone).toBe('America/Denver');
    expect(() =>
      createUpcomingExpense({
        ...expenseInput(),
        id: id('011'),
        dueDate: '2026-03-08',
      }),
    ).toThrow(/after.*original local date/i);
    expect(() =>
      createUpcomingExpense({
        ...expenseInput(),
        id: id('012'),
        dueDate: '2026-03-10',
        entryContext: { ...entryContext, localDate: '2026-03-07' },
      }),
    ).toThrow(/local date.*instant|time zone/i);
  });

  it('keeps date-only meaning after travel and records reschedules without rewriting creation context', () => {
    const original = expense();
    const changed = rescheduleUpcomingExpense(
      original,
      '2026-03-15',
      {
        enteredAt: '2026-03-12T23:30:00.000Z',
        localDate: '2026-03-13',
        timeZone: 'Asia/Tokyo',
      },
      'user-1',
    );
    expect(changed.entryContext).toEqual(entryContext);
    expect(changed.dueDate).toBe('2026-03-15');
    expect(changed.dateChangeHistory).toHaveLength(1);
    expect(changed.dateChangeHistory[0]).toMatchObject({
      previousDueDate: '2026-03-09',
      dueDate: '2026-03-15',
      context: { localDate: '2026-03-13', timeZone: 'Asia/Tokyo' },
    });
  });

  it('distinguishes due today, cancelled, partly paid, paid and overpaid', () => {
    const original = expense();
    expect(deriveUpcomingExpenseState(original, [], '2026-03-09').state).toBe('due-today');
    expect(
      deriveUpcomingExpenseState(cancelUpcomingExpense(original, 'user-1'), [], '2026-03-12').state,
    ).toBe('cancelled');

    const first = createExpenseFulfillment({
      id: id('020'),
      expense: original,
      transaction: payment(),
      amountMinor: 6_000,
      existing: [],
      actorId: 'user-1',
    });
    expect(deriveUpcomingExpenseState(original, [first], '2026-03-12')).toMatchObject({
      state: 'partly-paid-overdue',
      fulfilledAmountMinor: 6_000,
      remainingAmountMinor: 4_000,
    });

    const second = createExpenseFulfillment({
      id: id('021'),
      expense: original,
      transaction: payment({ id: id('011'), amountMinor: -6_000 }),
      amountMinor: 6_000,
      existing: [first],
      actorId: 'user-1',
    });
    expect(deriveUpcomingExpenseState(original, [first, second], '2026-03-12')).toMatchObject({
      state: 'paid',
      remainingAmountMinor: 0,
      overpaidAmountMinor: 2_000,
    });
  });

  it('labels pending fulfillment without treating it as paid and reserves its capacity', () => {
    const provisional = payment({ pending: true });
    const claim = createExpenseFulfillment({
      id: id('022'),
      expense: expense(),
      transaction: provisional,
      amountMinor: 4_000,
      existing: [],
      actorId: 'user-1',
    });
    expect(claim.calculationState).toBe('awaiting-posting');
    expect(deriveUpcomingExpenseState(expense(), [claim], '2026-03-12')).toMatchObject({
      state: 'overdue',
      fulfilledAmountMinor: 0,
    });
    expect(expenseFulfillmentCapacity(provisional, [claim]).remainingMinor).toBe(2_000);
  });

  it('requires positive money and eligible account/currency/expense references', () => {
    for (const change of [
      { amountMinor: 0 },
      { transaction: payment({ accountId: id('099') }) },
      { transaction: payment({ currency: 'EUR' }) },
      { transaction: payment({ amountMinor: 2_000 }) },
      { transaction: payment({ transferId: id('098') }) },
    ])
      expect(() =>
        createExpenseFulfillment({
          id: id('023'),
          expense: expense(),
          transaction: payment(),
          amountMinor: 1_000,
          existing: [],
          actorId: 'user-1',
          ...change,
        }),
      ).toThrow();
  });

  it('preserves typed planned-source occurrence identity and requires explicit reopening', () => {
    const source = {
      type: 'reusableOccurrence' as const,
      reusableItemId: id('030'),
      occurrenceDate: '2026-03-09',
    };
    const linked = createUpcomingExpense({
      ...expenseInput(),
      id: id('031'),
      plannedSource: source,
    });
    expect(plannedSourceIdentity(linked.plannedSource!)).toBe(
      `reusableOccurrence:${id('030')}:2026-03-09`,
    );
    const cancelled = cancelUpcomingExpense(linked, 'user-1');
    const reopened = reopenUpcomingExpense(
      cancelled,
      '2026-03-20',
      {
        enteredAt: '2026-03-13T12:00:00.000Z',
        localDate: '2026-03-13',
        timeZone: 'UTC',
      },
      'user-1',
    );
    expect(reopened.lifecycle).toBe('active');
    expect(reopened.entryContext).toEqual(entryContext);
  });
});
