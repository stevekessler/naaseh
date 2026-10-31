import { describe, expect, it } from 'vitest';
import {
  financeBudgetDetailSchema,
  financeBudgetInputSchema,
  financeBudgetPageSchema,
  financeBudgetPatchSchema,
} from '@naaseh/contracts';

const budget = {
  id: '01J00000000000000000000201',
  groupId: '01J00000000000000000000202',
  name: 'April household plan',
  budgetDate: '2026-04-01',
  startDate: '2026-04-01',
  endDate: '2026-04-30',
  status: 'active',
  items: [
    {
      id: '01J00000000000000000000203',
      description: 'Groceries',
      financeCategoryId: '01J00000000000000000000204',
      plannedAmountMinor: -10_000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: ['01J00000000000000000000205'],
      creatorId: 'member-a',
      status: 'active',
      version: 1,
    },
  ],
  totals: [
    {
      currency: 'USD',
      currencyExponent: 2,
      plannedMinor: -10_000,
      actualMinor: -8_000,
      varianceMinor: 2_000,
    },
  ],
  totalsComplete: true,
  version: 1,
};

describe('Finance budget HTTP contracts', () => {
  it('accepts bounded, single-date, and open-ended budget creation', () => {
    const input = {
      groupId: budget.groupId,
      name: budget.name,
      budgetDate: budget.budgetDate,
      startDate: budget.startDate,
      endDate: budget.endDate,
    };
    expect(financeBudgetInputSchema.parse(input)).toEqual(input);
    expect(
      financeBudgetInputSchema.parse({ ...input, startDate: '2026-04-15', endDate: '2026-04-15' })
        .endDate,
    ).toBe('2026-04-15');
    expect(financeBudgetInputSchema.parse({ ...input, endDate: null }).endDate).toBeNull();
    expect(financeBudgetInputSchema.safeParse({ ...input, endDate: '2026-03-31' }).success).toBe(
      false,
    );
  });

  it('requires optimistic concurrency and rejects protected or unrecognized fields', () => {
    expect(financeBudgetPatchSchema.parse({ expectedVersion: 1, name: 'Updated plan' })).toEqual({
      expectedVersion: 1,
      name: 'Updated plan',
    });
    expect(financeBudgetPatchSchema.safeParse({ name: 'No version' }).success).toBe(false);
    expect(
      financeBudgetPatchSchema.safeParse({ expectedVersion: 1, groupId: budget.groupId }).success,
    ).toBe(false);
  });

  it('returns exact grouped totals and a mandatory viewer-completeness flag', () => {
    expect(financeBudgetDetailSchema.parse(budget)).toEqual(budget);
    expect(financeBudgetPageSchema.parse({ items: [budget], cursor: null })).toMatchObject({
      cursor: null,
    });
    expect(
      financeBudgetDetailSchema.safeParse({ ...budget, totalsComplete: undefined }).success,
    ).toBe(false);
    expect(financeBudgetDetailSchema.safeParse({ ...budget, hiddenAccountCount: 1 }).success).toBe(
      false,
    );
  });
});
