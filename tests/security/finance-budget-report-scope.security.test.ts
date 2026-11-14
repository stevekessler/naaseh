import { describe, expect, it } from 'vitest';
import { financeQueryFiltersSchema } from '@naaseh/contracts';
import { filterSpendSlices, sumSpendByCurrency } from '@naaseh/domain';
import { matchesFinanceFact, type FinanceFact } from '../../apps/api/src/finance/query-contract.js';
const budgetId = '01J00000000000000000000001';
describe('budget-only report scope', () => {
  it('excludes non-budgeted and other-budget activity and rejects a forecast opt-in on report filters', () => {
    const base: FinanceFact = {
      id: 'mixed',
      accountId: 'account',
      effectiveAt: '2026-11-01T00:00:00Z',
      currency: 'USD',
      currencyExponent: 2,
      amountMinor: -10000,
      description: 'Synthetic',
      sourceVersion: 1,
      slices: [],
    };
    const slice = {
      transactionId: base.id,
      accountId: base.accountId,
      effectiveAt: base.effectiveAt,
      currency: base.currency,
      currencyExponent: base.currencyExponent,
    };
    const selected = { ...slice, budgetId, amountMinor: 3000 };
    const outside = { ...slice, amountMinor: 2000 };
    const another = { ...slice, budgetId: '01J00000000000000000000002', amountMinor: 5000 };
    const filters = financeQueryFiltersSchema.parse({ budgetIds: [budgetId] });
    expect(matchesFinanceFact({ ...base, slices: [outside, another] }, filters)).toBe(false);
    expect(matchesFinanceFact({ ...base, slices: [selected, outside, another] }, filters)).toBe(
      true,
    );
    expect(sumSpendByCurrency(filterSpendSlices([selected, outside, another], filters))).toEqual([
      { currency: 'USD', currencyExponent: 2, amountMinor: 3000 },
    ]);
    expect(
      financeQueryFiltersSchema.safeParse({
        budgetIds: [budgetId],
        includeNonBudgetedHistory: true,
      }).success,
    ).toBe(false);
  });
});
