import { describe, expect, it } from 'vitest';
import {
  buildForecastActivity,
  calculateBudgetForecast,
  type ForecastActivity,
} from './forecast.js';
import type { BudgetHistoryCandidate } from './forecast-history-scope.js';
import type { FinancialTransaction } from './transaction.js';

const scope = {
  budgetId: 'budget',
  authorizedBudgetIds: new Set(['budget']),
  authorizedAccountIds: new Set(['owned']),
  linkedAccountIds: new Set(['owned', 'hidden']),
};
const window = { dateFrom: '2026-04-01', dateTo: '2026-06-30', basis: 'budget' as const };
const actual = (
  date: string,
  amountMinor: number,
  kind: ForecastActivity['kind'] = 'expense',
  currency = 'USD',
  assignment: BudgetHistoryCandidate<ForecastActivity>['assignment'] = {
    kind: 'budget',
    budgetId: 'budget',
  },
  accountId = 'owned',
): BudgetHistoryCandidate<ForecastActivity> => ({
  accountId,
  assignment,
  value: {
    id: JSON.stringify([date, amountMinor, kind, currency, assignment, accountId]),
    date,
    kind,
    amountMinor,
    currency,
  },
});
const base = { window, asOfDate: '2026-04-15', scope, actualsComplete: true };
const amounts = (incomeMinor: number, expenseMinor: number) => ({
  incomeMinor,
  expenseMinor,
  netMinor: incomeMinor - expenseMinor,
});

describe('per-budget forecast calculations', () => {
  it('adds allocated actuals to authoritative remaining obligations without duplicates', () => {
    const plan = {
      id: 'same',
      source: 'plan' as const,
      dueDate: '2026-05-01',
      kind: 'expense' as const,
      currency: 'USD',
      remainingMinor: 600,
    };
    const result = calculateBudgetForecast({
      ...base,
      method: 'known-plan',
      obligationsComplete: true,
      candidates: [
        actual('2026-04-04', 200, 'expense'),
        actual('2026-04-08', -50),
        actual('2026-04-08', 500, 'income'),
        actual('2026-04-09', 700, 'income', 'JPY'),
        actual('2026-04-09', 1000, 'income', 'USD', { kind: 'unbudgeted' }),
      ],
      obligations: [
        plan,
        { ...plan, source: 'upcoming', dueDate: '2026-03-11', remainingMinor: 400 },
        { ...plan, id: 'cancelled' },
        { ...plan, id: 'cancelled', source: 'upcoming', remainingMinor: 0 },
        { ...plan, id: 'may-income', kind: 'income', remainingMinor: 250 },
      ],
    });
    expect(result).toMatchObject({
      status: 'ready',
      coverage: 'complete',
      includeNonBudgetedHistory: false,
      currencies: [
        {
          currency: 'JPY',
          currencyExponent: 0,
          actual: amounts(700, 0),
          remaining: amounts(0, 0),
          projected: amounts(700, 0),
        },
        {
          currency: 'USD',
          currencyExponent: 2,
          actual: amounts(500, 150),
          remaining: amounts(250, 400),
          projected: amounts(750, 550),
        },
      ],
    });
  });

  it('predicts remaining flow using complete observed calendar months and explicit opt-in', () => {
    const candidates = [
      ...[1, 2, 3].flatMap((month) => {
        const day = '2026-0' + month + '-11';
        return [
          actual(day, 200),
          actual(day, 400, 'income'),
          actual(day, 200, 'expense', 'USD', { kind: 'unbudgeted' }),
          actual(day, 999, 'expense', 'USD', { kind: 'budget', budgetId: 'different' }),
        ];
      }),
      actual('2026-04-06', 13),
      actual('2026-04-07', 55, 'income', 'USD', { kind: 'unbudgeted' }),
    ];
    const input = {
      ...base,
      method: 'historical' as const,
      candidates,
      coveredHistoryMonths: ['2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03'],
    };
    // Six covered months, with three containing spend. The remaining horizon is 2.5 months.
    const strict = calculateBudgetForecast(input);
    const expanded = calculateBudgetForecast({
      ...input,
      scope: { ...scope, includeNonBudgetedHistory: true },
    });
    expect(strict).toMatchObject({
      method: 'historical',
      status: 'ready',
      observed: { dateFrom: '2025-10-01', dateTo: '2026-03-31', coveredMonths: 6 },
      currencies: [
        { actual: amounts(0, 13), remaining: amounts(500, 250), projected: amounts(500, 263) },
      ],
    });
    expect(expanded.currencies[0]).toMatchObject({
      actual: amounts(0, 13),
      remaining: amounts(500, 500),
      projected: amounts(500, 513),
    });
  });

  it('does not treat missing, unresolved, or inaccessible history as a complete prediction', () => {
    const candidates = [
      actual('2026-01-02', 200),
      actual('2026-02-02', 200),
      actual('2026-03-02', 200),
      actual('2026-03-01', 999, 'expense', 'USD', { kind: 'unresolved' }),
      actual('2026-03-03', 999, 'expense', 'USD', { kind: 'unbudgeted' }, 'hidden'),
      actual('2026-04-01', 150),
      actual('2026-04-03', 50, 'income', 'CAD'),
    ];
    const result = calculateBudgetForecast({
      ...base,
      method: 'historical',
      candidates,
      coveredHistoryMonths: ['2026-02', '2026-03'],
      scope: { ...scope, includeNonBudgetedHistory: true },
    });
    expect(result).toMatchObject({
      status: 'insufficient-history',
      coverage: 'partial',
      currencies: [
        { currency: 'CAD', actual: amounts(50, 0), remaining: null, projected: null },
        { currency: 'USD', actual: amounts(0, 150), remaining: null, projected: null },
      ],
    });
  });

  it('uses current posting, transfer, refund and allocation eligibility at the model boundary', () => {
    const id = '01J00000000000000000000601';
    const allocation = '01J00000000000000000000602';
    const refundId = '01J00000000000000000000603';
    const transaction = {
      id,
      accountId: 'owned',
      origin: 'manual',
      amountMinor: -800,
      currency: 'USD',
      currencyExponent: 2,
      effectiveAt: '2026-04-16T01:00:00Z',
      postedAt: '2026-04-16T01:00:00Z',
      description: 'Expense',
      pending: false,
      allocations: [
        { id: allocation, amountMinor: -800, financeCategoryId: '01J00000000000000000000604' },
      ],
      reconciliationState: 'not-applicable',
      reviewState: 'none',
      status: 'active',
      version: 1,
    } as FinancialTransaction;
    expect(buildForecastActivity(transaction, {}, 'America/Denver')).toMatchObject([
      { amountMinor: 800, kind: 'expense', date: '2026-04-15' },
    ]);
    expect(buildForecastActivity({ ...transaction, transferId: 'transfer' }, {}, 'UTC')).toEqual(
      [],
    );
    expect(buildForecastActivity({ ...transaction, pending: true }, {}, 'UTC')).toEqual([]);
    const credit = { ...transaction, id: refundId, amountMinor: 200, allocations: [] };
    expect(buildForecastActivity(credit, {}, 'UTC')).toEqual([]);
    expect(
      buildForecastActivity(credit, {}, 'UTC', [{ id: 'salary', amountMinor: 100 }]),
    ).toMatchObject([{ amountMinor: 100, kind: 'income' }]);
    expect(() =>
      buildForecastActivity(credit, {}, 'UTC', [{ id: 'salary', amountMinor: 201 }]),
    ).toThrow();
    expect(
      buildForecastActivity(
        credit,
        {
          original: transaction,
          refund: {
            id: '01J00000000000000000000605',
            refundTransactionId: refundId,
            originalExpenseTransactionId: id,
            currency: 'USD',
            currencyExponent: 2,
            linkedAmountMinor: 200,
            refundedAllocations: [
              {
                originalAllocationId: allocation,
                originalAllocationRevision: 1,
                amountMinor: 200,
                categoryId: transaction.allocations[0]!.financeCategoryId,
              },
            ],
            refundSourceVersion: 1,
            originalSourceVersion: 1,
            status: 'active',
            calculationState: 'valid',
            createdBy: 'owner',
            createdAt: credit.effectiveAt,
            updatedAt: credit.effectiveAt,
            version: 1,
          },
        },
        'UTC',
        [{ id: 'salary', amountMinor: 100 }],
      ),
    ).toMatchObject([{ amountMinor: -200, kind: 'expense' }]);
  });
});
