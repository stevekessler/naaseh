import { describe, expect, it } from 'vitest';
import { selectBudgetHistoryRows, type BudgetHistoryCandidate } from './forecast-history-scope.js';
type Row = { id: string; transactionId?: string; amountMinor?: number; currency?: string };
const budget = (
  id: string,
  budgetId = 'budget',
  accountId = 'account',
): BudgetHistoryCandidate<Row> => ({
  accountId,
  assignment: { kind: 'budget', budgetId },
  value: { id },
});
const unbudgeted = (id: string, accountId = 'account'): BudgetHistoryCandidate<Row> => ({
  accountId,
  assignment: { kind: 'unbudgeted' },
  value: { id },
});
const scope = {
  budgetId: 'budget',
  authorizedBudgetIds: new Set(['budget']),
  authorizedAccountIds: new Set(['account', 'old-account']),
  linkedAccountIds: new Set(['account']),
};
describe('budget reporting and optional forecast history boundaries', () => {
  it('defaults to authorized budget rows, preserving budget-assigned history after an account is unlinked', () => {
    const result = selectBudgetHistoryRows(
      [
        budget('assigned'),
        budget('historical', 'budget', 'old-account'),
        unbudgeted('outside'),
        budget('another', 'other-budget'),
      ],
      scope,
    );
    expect(result).toEqual({
      budgetRows: [{ id: 'assigned' }, { id: 'historical' }],
      nonBudgetedRows: [],
      inputsComplete: true,
    });
  });
  it('adds only explicitly requested, authorized non-budgeted linked-account history in a separate collection', () => {
    const rows = [
      budget('assigned'),
      unbudgeted('outside'),
      unbudgeted('unlinked', 'old-account'),
      unbudgeted('private', 'private-account'),
      budget('another', 'other-budget'),
    ];
    const result = selectBudgetHistoryRows(rows, {
      ...scope,
      linkedAccountIds: new Set(['account', 'private-account']),
      includeNonBudgetedHistory: true,
    });
    expect(result.budgetRows).toEqual([{ id: 'assigned' }]);
    expect(result.nonBudgetedRows).toEqual([{ id: 'outside' }]);
    expect(result.inputsComplete).toBe(false);
    expect(
      selectBudgetHistoryRows(rows, { ...scope, includeNonBudgetedHistory: false }).nonBudgetedRows,
    ).toEqual([]);
  });
  it('keeps allocation portions separate without turning a mixed transaction into wholly unbudgeted history', () => {
    const assigned = Object.freeze({
      id: 'allocation-budget',
      transactionId: 'mixed',
      amountMinor: 3000,
      currency: 'USD',
    });
    const outside = Object.freeze({
      id: 'allocation-outside',
      transactionId: 'mixed',
      amountMinor: 2000,
      currency: 'USD',
    });
    const rows: BudgetHistoryCandidate<Row>[] = [
      { ...budget(''), value: assigned },
      { ...unbudgeted(''), value: outside },
      {
        ...budget('', 'other-budget'),
        value: {
          id: 'allocation-other',
          transactionId: 'mixed',
          amountMinor: 5000,
          currency: 'USD',
        },
      },
    ];
    const result = selectBudgetHistoryRows(rows, { ...scope, includeNonBudgetedHistory: true });
    expect(result.budgetRows).toEqual([assigned]);
    expect(result.nonBudgetedRows).toEqual([outside]);
    expect(result.budgetRows[0]).toBe(assigned);
    const reportAfterForecast = selectBudgetHistoryRows(rows, scope);
    expect(reportAfterForecast.budgetRows).toEqual([assigned]);
    expect(reportAfterForecast.nonBudgetedRows).toEqual([]);
    expect(result.inputsComplete).toBe(true);
  });
  it('fails closed after either budget or account access is withdrawn even with history requested', () => {
    const rows = [budget('assigned'), unbudgeted('outside')];
    for (const revoked of [
      { authorizedBudgetIds: new Set<string>() },
      { authorizedAccountIds: new Set<string>() },
    ])
      expect(
        selectBudgetHistoryRows(rows, { ...scope, ...revoked, includeNonBudgetedHistory: true }),
      ).toEqual({ budgetRows: [], nonBudgetedRows: [], inputsComplete: false });
  });
  it('does not treat unresolved assignment as unbudgeted data or an invalid budget as a global query', () => {
    const rows: BudgetHistoryCandidate<Row>[] = [
      {
        accountId: 'account',
        assignment: {
          kind: 'legacy-unknown',
        } as unknown as BudgetHistoryCandidate<Row>['assignment'],
        value: { id: 'unknown' },
      },
    ];
    expect(selectBudgetHistoryRows(rows, { ...scope, includeNonBudgetedHistory: true })).toEqual({
      budgetRows: [],
      nonBudgetedRows: [],
      inputsComplete: false,
    });
    expect(() => selectBudgetHistoryRows(rows, { ...scope, budgetId: '' })).toThrow(/budget/i);
  });
});
