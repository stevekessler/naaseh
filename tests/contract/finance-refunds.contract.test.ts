import { describe, expect, it } from 'vitest';
import {
  financeRefundRelationshipDeleteSchema,
  financeRefundRelationshipPutSchema,
} from '@naaseh/contracts';
import { buildSpendSlices, createExpenseRefundRelationship } from '@naaseh/domain';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';

describe('linked expense refund contracts', () => {
  it('requires source/capacity versions and explicit partial-allocation confirmation', () => {
    const request = {
      originalExpenseTransactionId: experienceId(300),
      linkedAmountMinor: 2_500,
      refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
      confirmedPartialAllocations: true,
      expectedRefundVersion: 1,
      expectedOriginalVersion: 1,
      expectedCreditCapacityVersion: 0,
      expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
    };
    expect(financeRefundRelationshipPutSchema.parse(request)).toEqual(request);
    expect(
      financeRefundRelationshipPutSchema.safeParse({
        ...request,
        confirmedPartialAllocations: undefined,
      }).success,
    ).toBe(false);
    expect(
      financeRefundRelationshipPutSchema.safeParse({
        ...request,
        expectedCreditCapacityVersion: undefined,
      }).success,
    ).toBe(false);
  });

  it('requires relationship and both capacity versions to remove a link', () => {
    const request = {
      expectedRelationshipVersion: 2,
      expectedCreditCapacityVersion: 3,
      expectedAllocationCapacityVersions: { [experienceId(400)]: 4 },
    };
    expect(financeRefundRelationshipDeleteSchema.parse(request)).toEqual(request);
    expect(
      financeRefundRelationshipDeleteSchema.safeParse({
        expectedRelationshipVersion: 2,
        expectedCreditCapacityVersion: 3,
      }).success,
    ).toBe(false);
  });

  it('defaults full links from original associations without changing the received date', () => {
    const fixture = buildExperienceFixture();
    const original = fixture.transactions[0]!;
    const refund = { ...fixture.transactions[1]!, amountMinor: 10_000 };
    const relationship = createExpenseRefundRelationship({
      id: experienceId(899),
      original,
      refund,
      linkedAmountMinor: 10_000,
      confirmedPartialAllocations: false,
      existing: [],
      budgetItems: fixture.budgetItems,
      actorId: fixture.actors.owner.id,
    });
    expect(relationship.refundedAllocations).toHaveLength(original.allocations.length);
    expect(buildSpendSlices(refund, { refund: relationship, original })[0]?.effectiveAt).toBe(
      refund.effectiveAt,
    );
  });

  it('never guesses an offset for an unlinked credit', () => {
    const fixture = buildExperienceFixture();
    expect(buildSpendSlices(fixture.transactions[1]!, {})).toEqual([]);
  });
});
