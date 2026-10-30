import { describe, expect, it } from 'vitest';
import {
  financeCategoryInputSchema,
  financeCategoryPatchSchema,
  financeCategorySchema,
  financeMerchantActivitySchema,
  financeMerchantInputSchema,
  financeMerchantPageSchema,
  financeMerchantSchema,
  financeProblemSchema,
  financialTransactionSchema,
  providerReconciliationDecisionInputSchema,
  transactionAllocationReplacementSchema,
  transactionPageSchema,
} from '@naaseh/contracts';

const ids = {
  transaction: '01J00000000000000000000001',
  account: '01J00000000000000000000002',
  category: '01J00000000000000000000003',
  allocation: '01J00000000000000000000004',
  merchant: '01J00000000000000000000005',
  review: '01J00000000000000000000006',
  candidate: '01J00000000000000000000007',
};

const transaction = {
  id: ids.transaction,
  accountId: ids.account,
  origin: 'manual',
  entrySnapshot: {
    transactedAt: '2026-01-15T12:00:00.000Z',
    amountMinor: -1_250,
    description: 'Fixture lunch',
    pending: false,
  },
  postedAt: null,
  transactedAt: '2026-01-15T12:00:00.000Z',
  amountMinor: -1_250,
  currency: 'USD',
  currencyExponent: 2,
  description: 'Fixture lunch',
  pending: false,
  allocations: [{ id: ids.allocation, amountMinor: -1_250, financeCategoryId: ids.category }],
  reviewState: 'none',
  reconciliationState: 'provisional',
  version: 1,
};

describe('Finance transaction, category, and merchant HTTP contracts', () => {
  it('accepts strict transaction pages and rejects unrecognized protected fields', () => {
    expect(financialTransactionSchema.parse(transaction).id).toBe(ids.transaction);
    expect(
      transactionPageSchema.parse({ items: [transaction], cursor: null, totalsComplete: true }),
    ).toMatchObject({ cursor: null, totalsComplete: true });
    expect(
      financialTransactionSchema.safeParse({ ...transaction, accountOwnerName: 'hidden' }).success,
    ).toBe(false);
  });

  it('bounds allocation replacement and reconciliation decisions with optimistic versions', () => {
    expect(
      transactionAllocationReplacementSchema.parse({
        expectedVersion: 1,
        allocations: transaction.allocations,
      }).allocations,
    ).toHaveLength(1);
    expect(
      transactionAllocationReplacementSchema.safeParse({
        expectedVersion: 1,
        allocations: Array.from({ length: 101 }, () => transaction.allocations[0]),
      }).success,
    ).toBe(false);

    const decision = {
      decision: 'reconcile',
      reviewIssueId: ids.review,
      candidateTransactionId: ids.candidate,
      expectedProvisionalVersion: 1,
      expectedCandidateVersion: 2,
      expectedReviewVersion: 3,
    };
    expect(providerReconciliationDecisionInputSchema.parse(decision).decision).toBe('reconcile');
    expect(
      providerReconciliationDecisionInputSchema.safeParse({ ...decision, hiddenCandidate: true })
        .success,
    ).toBe(false);
  });

  it('defines strict global category and merchant catalog payloads', () => {
    expect(financeCategoryInputSchema.parse({ name: 'Dining' }).name).toBe('Dining');
    expect(
      financeCategoryPatchSchema.parse({ expectedVersion: 1, status: 'archived' }).status,
    ).toBe('archived');
    expect(
      financeCategorySchema.parse({
        id: ids.category,
        name: 'Dining',
        origin: 'user',
        creatorId: 'user-a',
        status: 'active',
        version: 1,
      }).origin,
    ).toBe('user');

    const merchant = financeMerchantSchema.parse({
      id: ids.merchant,
      name: 'Fixture Cafe',
      source: 'manual',
      creatorId: 'user-a',
      status: 'active',
      version: 1,
    });
    expect(financeMerchantInputSchema.parse({ name: merchant.name }).name).toBe('Fixture Cafe');
    expect(financeMerchantPageSchema.parse({ items: [merchant], cursor: null }).cursor).toBeNull();
    expect(
      financeMerchantActivitySchema.parse({
        merchant,
        transactions: [transaction],
        totalsComplete: true,
        cursor: null,
      }).totalsComplete,
    ).toBe(true);
  });

  it('keeps inaccessible reconciliation candidates behind one generic problem shape', () => {
    const notFound = {
      type: 'urn:naaseh:problem:finance_not_found',
      title: 'Finance record not found.',
      status: 404,
      code: 'finance_not_found',
      correlationId: 'fixture-correlation',
    };
    expect(financeProblemSchema.parse(notFound)).toEqual(notFound);
    expect(
      financeProblemSchema.safeParse({ ...notFound, candidateTransactionId: ids.candidate })
        .success,
    ).toBe(false);
  });
});
