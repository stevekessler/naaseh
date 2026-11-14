import { describe, expect, it } from 'vitest';
import { buildExperienceFixture, experienceId } from '../fixtures/finance/experience.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import { reconcileRefundTransactionAlias } from '../../apps/api/src/finance/refund-repository.js';
import {
  deleteExpenseRefundRelationship,
  getExpenseRefundRelationship,
  putExpenseRefundRelationship,
  reviewRefundRelationshipsForTransaction,
} from '../../apps/api/src/finance/refund-service.js';

const setup = () => {
  const fixture = buildExperienceFixture();
  const repository = new FinanceMemoryRepository();
  for (const account of fixture.accounts) repository.accounts.set(account.id, account);
  repository.transactions.push(...fixture.transactions);
  for (const item of fixture.budgetItems) repository.budgetItems.set(item.id, item);
  return { fixture, repository };
};

describe('expense refund relationship service', () => {
  it('links cross-account same-currency credit, retries safely, unlinks and relinks capacity', () => {
    const { fixture, repository } = setup();
    const original = fixture.transactions[0]!;
    const refund = fixture.transactions[1]!;
    const input = {
      id: experienceId(850),
      originalExpenseTransactionId: original.id,
      linkedAmountMinor: 2_500,
      refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
      confirmedPartialAllocations: true,
      expectedRefundVersion: refund.version,
      expectedOriginalVersion: original.version,
      expectedCreditCapacityVersion: 0,
      expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
    };
    const linked = putExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      refund.id,
      input,
      'refund-link',
    );
    expect(linked.relationship).toMatchObject({
      refundTransactionId: refund.id,
      originalExpenseTransactionId: original.id,
      linkedAmountMinor: 2_500,
      status: 'active',
    });
    expect(
      putExpenseRefundRelationship(repository, fixture.actors.owner, refund.id, input, 'refund-link'),
    ).toEqual(linked);

    const removed = deleteExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      refund.id,
      {
        expectedRelationshipVersion: linked.relationship.version,
        expectedCreditCapacityVersion: linked.creditCapacityVersion,
        expectedAllocationCapacityVersions: linked.allocationCapacityVersions,
      },
      'refund-remove',
    );
    expect(removed.relationship.status).toBe('removed');

    const relinked = putExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      refund.id,
      {
        ...input,
        id: experienceId(851),
        expectedRelationshipVersion: removed.relationship.version,
        expectedCreditCapacityVersion: removed.creditCapacityVersion,
        expectedAllocationCapacityVersions: removed.allocationCapacityVersions,
      },
      'refund-relink',
    );
    expect(relinked.relationship.status).toBe('active');
    expect(getExpenseRefundRelationship(repository, fixture.actors.owner, refund.id)).toEqual(
      relinked,
    );
  });

  it('rejects competing principal claims and preserves classification snapshots after recategorization', () => {
    const { fixture, repository } = setup();
    const original = fixture.transactions[0]!;
    const firstRefund = fixture.transactions[1]!;
    const linked = putExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      firstRefund.id,
      {
        id: experienceId(852),
        originalExpenseTransactionId: original.id,
        linkedAmountMinor: 2_500,
        refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
        confirmedPartialAllocations: true,
        expectedRefundVersion: firstRefund.version,
        expectedOriginalVersion: original.version,
        expectedCreditCapacityVersion: 0,
        expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
      },
      'first-link',
    );
    original.allocations[0]!.financeCategoryId = experienceId(599);
    expect(linked.relationship.refundedAllocations[0]?.categoryId).toBe(experienceId(500));

    const secondRefund = fixture.transactions[2]!;
    expect(() =>
      putExpenseRefundRelationship(
        repository,
        fixture.actors.owner,
        secondRefund.id,
        {
          id: experienceId(853),
          originalExpenseTransactionId: original.id,
          linkedAmountMinor: 4_000,
          refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 4_000 }],
          confirmedPartialAllocations: true,
          expectedRefundVersion: secondRefund.version,
          expectedOriginalVersion: original.version,
          expectedCreditCapacityVersion: 0,
          expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
        },
        'competing-link',
      ),
    ).toThrow(/capacity|version|conflict/iu);
  });

  it('retains a provider correction but moves an incompatible accepted link to review', () => {
    const { fixture, repository } = setup();
    const original = fixture.transactions[0]!;
    const refund = fixture.transactions[1]!;
    const linked = putExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      refund.id,
      {
        id: experienceId(854),
        originalExpenseTransactionId: original.id,
        linkedAmountMinor: 2_500,
        refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
        confirmedPartialAllocations: true,
        expectedRefundVersion: refund.version,
        expectedOriginalVersion: original.version,
        expectedCreditCapacityVersion: 0,
        expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
      },
      'provider-review-link',
    );
    const refundIndex = repository.transactions.findIndex(({ id }) => id === refund.id);
    repository.transactions[refundIndex] = { ...refund, amountMinor: 1_000, version: 2 };
    reviewRefundRelationshipsForTransaction(repository, refund.id);
    expect(repository.refundRelationships.get(linked.relationship.id)).toMatchObject({
      calculationState: 'needs-review',
      refundedAllocations: linked.relationship.refundedAllocations,
      version: 2,
    });
    expect(repository.transactions[refundIndex]?.amountMinor).toBe(1_000);
  });

  it('moves accepted relationships and capacity revisions to a reconciled canonical alias', () => {
    const { fixture, repository } = setup();
    const original = fixture.transactions[0]!;
    const refund = fixture.transactions[1]!;
    const linked = putExpenseRefundRelationship(
      repository,
      fixture.actors.owner,
      refund.id,
      {
        id: experienceId(855),
        originalExpenseTransactionId: original.id,
        linkedAmountMinor: 2_500,
        refundedAllocations: [{ originalAllocationId: experienceId(400), amountMinor: 2_500 }],
        confirmedPartialAllocations: true,
        expectedRefundVersion: refund.version,
        expectedOriginalVersion: original.version,
        expectedCreditCapacityVersion: 0,
        expectedAllocationCapacityVersions: { [experienceId(400)]: 0 },
      },
      'alias-link',
    );
    const canonicalOriginalId = experienceId(399);
    reconcileRefundTransactionAlias(repository, original.id, canonicalOriginalId);
    expect(repository.refundRelationships.get(linked.relationship.id)).toMatchObject({
      originalExpenseTransactionId: canonicalOriginalId,
      version: 2,
    });
    expect(
      repository.refundAllocationCapacityVersions.get(
        `${canonicalOriginalId}:${experienceId(400)}`,
      ),
    ).toBe(1);
    expect(
      repository.refundAllocationCapacityVersions.has(`${original.id}:${experienceId(400)}`),
    ).toBe(false);
  });
});
