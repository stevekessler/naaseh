import { describe, expect, it } from 'vitest';
import {
  financeBudgetReconciliationInputSchema,
  financeReconciliationRecordSchema,
} from '@naaseh/contracts';

const ids = {
  budget: '01J00000000000000000000911',
  reconciliation: '01J00000000000000000000912',
  category: '01J00000000000000000000913',
};

describe('Finance budget reconciliation contracts', () => {
  it('requires an optimistic version and validates immutable evidence', () => {
    expect(financeBudgetReconciliationInputSchema.parse({ expectedVersion: 4 })).toEqual({
      expectedVersion: 4,
    });
    expect(
      financeReconciliationRecordSchema.parse({
        id: ids.reconciliation,
        budgetId: ids.budget,
        reconciledAt: '2027-09-30T23:00:00.000Z',
        reconciledBy: 'member-1',
        budgetVersion: 4,
        sourceVersionDigest: 'a'.repeat(64),
        totalsByCurrency: [
          {
            currency: 'USD',
            currencyExponent: 2,
            plannedMinor: -5_000,
            actualMinor: -4_500,
            varianceMinor: 500,
          },
        ],
        totalsByCategory: [
          {
            financeCategoryId: ids.category,
            currency: 'USD',
            currencyExponent: 2,
            plannedMinor: -5_000,
            actualMinor: -4_500,
            varianceMinor: 500,
          },
        ],
      }),
    ).toBeTruthy();
  });

  it('rejects stale-shaped, content-bearing, and malformed reconciliation requests', () => {
    expect(financeBudgetReconciliationInputSchema.safeParse({ expectedVersion: 0 }).success).toBe(
      false,
    );
    expect(
      financeBudgetReconciliationInputSchema.safeParse({ expectedVersion: 1, hiddenAccountId: 'x' })
        .success,
    ).toBe(false);
    expect(
      financeReconciliationRecordSchema.safeParse({
        id: ids.reconciliation,
        budgetId: ids.budget,
        reconciledAt: '2027-09-30T23:00:00.000Z',
        reconciledBy: 'member-1',
        budgetVersion: 1,
        sourceVersionDigest: 'not-a-digest',
        totalsByCurrency: [],
        totalsByCategory: [],
      }).success,
    ).toBe(false);
  });
});
