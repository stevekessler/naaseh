import { describe, expect, it } from 'vitest';
import {
  archiveReusableBudgetItem,
  copyReusableBudgetItem,
  createReusableBudgetItem,
  reusableOccurrenceDates,
} from './reusable-item.js';

const source = () =>
  createReusableBudgetItem({
    id: 'reusable-1',
    groupId: 'group-1',
    description: 'Mobile service',
    merchantId: 'merchant-1',
    financeCategoryId: 'category-1',
    plannedAmountMinor: -50_000,
    currency: 'USD',
    relatedAccountIds: ['account-1'],
    creatorId: 'member-1',
    recurrence: { interval: 1, unit: 'month', startDate: '2027-01-31', endDate: '2027-04-30' },
  });

describe('reusable budget items', () => {
  it('generates bounded recurring occurrences with calendar-end clamping', () => {
    expect(
      reusableOccurrenceDates(source(), { startDate: '2027-01-01', endDate: '2027-04-30' }),
    ).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('offers a one-time future item only inside the applicable budget period', () => {
    const future = createReusableBudgetItem({
      id: 'future-1',
      groupId: 'group-1',
      description: 'Future insurance',
      financeCategoryId: 'category-1',
      plannedAmountMinor: -10_000,
      currency: 'USD',
      relatedAccountIds: ['account-1'],
      creatorId: 'member-1',
      applicableDate: '2027-09-15',
    });
    expect(
      reusableOccurrenceDates(future, { startDate: '2027-09-01', endDate: '2027-09-30' }),
    ).toEqual(['2027-09-15']);
    expect(
      reusableOccurrenceDates(future, { startDate: '2027-10-01', endDate: '2027-10-31' }),
    ).toEqual([]);
  });

  it('copies independently and excludes archived sources from future offers', () => {
    const reusable = source();
    const copy = copyReusableBudgetItem(reusable, {
      id: 'budget-item-1',
      budgetId: 'budget-1',
      creatorId: 'member-2',
      occurrenceDate: '2027-02-28',
    });
    copy.plannedAmountMinor = -45_000;
    expect(reusable.plannedAmountMinor).toBe(-50_000);
    expect(copy).toMatchObject({ sourceReusableItemId: reusable.id, applicableDate: '2027-02-28' });
    expect(
      reusableOccurrenceDates(archiveReusableBudgetItem(reusable), {
        startDate: '2027-01-01',
        endDate: '2027-12-31',
      }),
    ).toEqual([]);
  });
});
