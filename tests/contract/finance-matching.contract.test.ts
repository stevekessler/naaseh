import { describe, expect, it } from 'vitest';
import {
  financeReusableItemInputSchema,
  financeReusableItemSchema,
  financeTransactionMatchDecisionSchema,
  financeTransactionMatchSchema,
} from '@naaseh/contracts';

const ids = {
  group: '01J00000000000000000000601',
  reusable: '01J00000000000000000000602',
  category: '01J00000000000000000000603',
  merchant: '01J00000000000000000000604',
  account: '01J00000000000000000000605',
  transaction: '01J00000000000000000000606',
  item: '01J00000000000000000000607',
  match: '01J00000000000000000000608',
};

describe('Finance matching contracts', () => {
  it('validates reusable recurrence and one-time future inputs', () => {
    const recurring = {
      groupId: ids.group,
      description: 'Mobile service',
      merchantId: ids.merchant,
      financeCategoryId: ids.category,
      plannedAmountMinor: -50_000,
      currency: 'USD',
      currencyExponent: 2,
      relatedAccountIds: [ids.account],
      recurrence: { interval: 1, unit: 'month', startDate: '2027-01-31', endDate: '2027-12-31' },
    };
    expect(financeReusableItemInputSchema.parse(recurring)).toEqual(recurring);
    expect(
      financeReusableItemInputSchema.safeParse({ ...recurring, applicableDate: '2027-09-15' })
        .success,
    ).toBe(false);
  });

  it('exposes content-free scoring evidence and optimistic decisions', () => {
    const match = {
      id: ids.match,
      transactionId: ids.transaction,
      budgetItemId: ids.item,
      kind: 'near',
      scoreBasis: { merchant: true, date: true, account: true, amountDifferencePercent: 9.7561 },
      status: 'suggested',
      version: 1,
    };
    expect(financeTransactionMatchSchema.parse(match)).toEqual(match);
    expect(
      financeTransactionMatchDecisionSchema.parse({
        decision: 'accept',
        expectedVersion: 1,
        expectedTransactionVersion: 2,
      }),
    ).toMatchObject({ decision: 'accept' });
    expect(
      financeTransactionMatchSchema.safeParse({ ...match, rawMerchantName: 'protected' }).success,
    ).toBe(false);
  });

  it('returns complete reusable records without coupling budget copies', () => {
    expect(
      financeReusableItemSchema.parse({
        id: ids.reusable,
        groupId: ids.group,
        description: 'Future insurance',
        financeCategoryId: ids.category,
        plannedAmountMinor: -10_000,
        currency: 'USD',
        currencyExponent: 2,
        relatedAccountIds: [ids.account],
        applicableDate: '2027-09-15',
        status: 'active',
        creatorId: 'member-1',
        version: 1,
      }),
    ).toMatchObject({ id: ids.reusable, applicableDate: '2027-09-15' });
  });
});
