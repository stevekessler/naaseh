import { describe, expect, it } from 'vitest';
import {
  buildExperienceFixture,
  experienceId,
} from '../../../../tests/fixtures/finance/experience.js';
import { createExpenseRefundRelationship, refundCapacity } from './refund.js';

function setup() {
  const f = buildExperienceFixture();
  const original = f.transactions[0]!;
  const refund = f.transactions[1]!;
  return {
    original,
    refund,
    input: {
      id: experienceId(800),
      original,
      refund,
      linkedAmountMinor: 2_500,
      refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
      confirmedPartialAllocations: true,
      existing: [],
      budgetItems: f.budgetItems,
      actorId: f.actors.owner.id,
      now: new Date('2026-10-31T18:00:00.000Z'),
    },
  };
}

describe('confirmed original expense refund capacity', () => {
  it('snapshots confirmed classifications and preserves the received date', () => {
    const { input, original, refund } = setup();
    const link = createExpenseRefundRelationship(input);
    expect(link).toMatchObject({
      refundTransactionId: refund.id,
      originalExpenseTransactionId: original.id,
      currency: 'USD',
      calculationState: 'valid',
      linkedAmountMinor: 2_500,
      refundedAllocations: [
        {
          originalAllocationId: experienceId(400),
          amountMinor: 2_500,
          categoryId: experienceId(500),
          budgetId: experienceId(200),
          budgetItemId: experienceId(600),
        },
      ],
    });
    original.allocations[0]!.financeCategoryId = experienceId(599);
    expect(link.refundedAllocations[0]!.categoryId).toBe(experienceId(500));
    expect(refund.effectiveAt).toBe('2026-10-02T18:00:00.000Z');
  });

  it('requires explicit allocation confirmation for a partial split refund', () => {
    const { input } = setup();
    expect(() =>
      createExpenseRefundRelationship({ ...input, confirmedPartialAllocations: false }),
    ).toThrow(/confirm/i);
    expect(() =>
      createExpenseRefundRelationship({
        ...input,
        refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_000 }],
      }),
    ).toThrow(/sum/i);
  });

  it('defaults a full refund to all original allocations without guessing partial proportions', () => {
    const { input } = setup();
    const link = createExpenseRefundRelationship({
      ...input,
      refund: { ...input.refund, amountMinor: 10_000 },
      linkedAmountMinor: 10_000,
      refundedAllocations: undefined,
      confirmedPartialAllocations: false,
    });
    expect(link.refundedAllocations.map((a) => a.amountMinor)).toEqual([6_000, 4_000]);
  });

  it('reserves original principal across different refund transactions including awaiting posting', () => {
    const { input } = setup();
    const first = createExpenseRefundRelationship(input);
    const secondRefund = {
      ...input.refund,
      id: experienceId(302),
      amountMinor: 5_000,
      pending: true,
    };
    expect(() =>
      createExpenseRefundRelationship({
        ...input,
        id: experienceId(801),
        refund: secondRefund,
        linkedAmountMinor: 4_000,
        refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 4_000 }],
        existing: [first],
      }),
    ).toThrow(/capacity/i);
    const second = createExpenseRefundRelationship({
      ...input,
      id: experienceId(801),
      refund: secondRefund,
      linkedAmountMinor: 1_500,
      refundedAllocations: [{ originalAllocationId: experienceId(401), amountMinor: 1_500 }],
      existing: [first],
    });
    expect(second.calculationState).toBe('awaiting-posting');
    expect(refundCapacity(input.original, [first, second])).toMatchObject({
      claimedMinor: 4_000,
      remainingMinor: 6_000,
    });
  });

  it('enforces one original per credit and credit magnitude while preserving excess unlinked credit', () => {
    const { input } = setup();
    const first = createExpenseRefundRelationship(input);
    expect(() =>
      createExpenseRefundRelationship({ ...input, id: experienceId(899), existing: [first] }),
    ).toThrow(/already|one original/i);
    expect(() =>
      createExpenseRefundRelationship({
        ...input,
        linkedAmountMinor: 2_501,
        refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_501 }],
      }),
    ).toThrow(/credit|capacity/i);
    const link = createExpenseRefundRelationship({
      ...input,
      linkedAmountMinor: 1_000,
      refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 1_000 }],
    });
    expect(link.linkedAmountMinor).toBe(1_000);
    expect(input.refund.amountMinor).toBe(2_500);
  });

  it('allows same-currency cross-account refunds and rejects cycles, transfers, income originals and foreign currency', () => {
    const { input } = setup();
    expect(
      createExpenseRefundRelationship({
        ...input,
        refund: { ...input.refund, accountId: experienceId(100) },
      }).status,
    ).toBe('active');
    for (const change of [
      { refund: { ...input.refund, currency: 'EUR' } },
      { original: { ...input.original, amountMinor: 1_000 } },
      { original: { ...input.original, transferId: experienceId(700) } },
      { refund: { ...input.refund, id: input.original.id } },
      { refund: { ...input.refund, amountMinor: Number.NaN } },
    ])
      expect(() => createExpenseRefundRelationship({ ...input, ...change })).toThrow();
  });

  it('releases removed relationships and rejects unknown, repeated or overclaimed allocation slices', () => {
    const { input } = setup();
    const removed = { ...createExpenseRefundRelationship(input), status: 'removed' as const };
    expect(refundCapacity(input.original, [removed]).remainingMinor).toBe(10_000);
    for (const allocations of [
      [{ originalAllocationId: experienceId(499), amountMinor: 2_500 }],
      [
        { originalAllocationId: experienceId(400), amountMinor: 1_000 },
        { originalAllocationId: experienceId(400), amountMinor: 1_500 },
      ],
      [{ originalAllocationId: experienceId(400), amountMinor: -2_500 }],
    ])
      expect(() =>
        createExpenseRefundRelationship({ ...input, refundedAllocations: allocations }),
      ).toThrow();
  });

  it('requires review rather than freeing capacity when an accepted original allocation disappears', () => {
    const { input } = setup();
    const relationship = createExpenseRefundRelationship(input);
    const corrected = {
      ...input.original,
      version: 2,
      allocations: input.original.allocations.map((allocation) => ({
        ...allocation,
        id: experienceId(499),
      })),
    };
    // Keep the original allocation graph valid while changing its identities.
    corrected.allocations[1]!.id = experienceId(498);
    expect(() => refundCapacity(corrected, [relationship])).toThrow(/review|allocation/i);
  });

  it('rejects inconsistent currency claims instead of combining their principal capacities', () => {
    const { input } = setup();
    const relationship = { ...createExpenseRefundRelationship(input), currency: 'EUR' };
    expect(() => refundCapacity(input.original, [relationship])).toThrow(/currency|review/i);
  });
});
