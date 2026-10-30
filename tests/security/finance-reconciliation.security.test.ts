import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  createImportReviewIssue,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { decideProviderReconciliation } from '../../apps/api/src/finance/provider-reconciliation-service.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';

const groupId = '01J00000000000000000000501';
const accountId = '01J00000000000000000000502';
const otherAccountId = '01J00000000000000000000503';
const provisionalId = '01J00000000000000000000511';
const candidateId = '01J00000000000000000000512';
const otherCandidateId = '01J00000000000000000000513';
const reviewId = '01J00000000000000000000521';

const member: FinanceActor = {
  id: 'member-a',
  role: 'user',
  active: true,
  groupMemberships: [{ groupId, role: 'member' }],
};

const setup = () => {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    accountId,
    createFinancialAccount({
      id: accountId,
      connectionId: 'connection-a',
      scope: { type: 'group', groupId },
      sourceName: 'Checking',
      organizationName: 'Visible Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  repository.accounts.set(
    otherAccountId,
    createFinancialAccount({
      id: otherAccountId,
      connectionId: 'connection-b',
      scope: { type: 'owner', ownerId: 'owner-b' },
      sourceName: 'Private',
      organizationName: 'Hidden Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 0,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  const provisional = createFinancialTransaction({
    id: provisionalId,
    accountId,
    origin: 'manual',
    amountMinor: -500,
    currency: 'USD',
    transactedAt: '2026-01-02T00:00:00.000Z',
    description: 'Cafe',
    pending: false,
    connectedAccount: true,
  });
  const candidate = createFinancialTransaction({
    id: candidateId,
    accountId,
    origin: 'simplefin',
    amountMinor: -500,
    currency: 'USD',
    transactedAt: '2026-01-03T00:00:00.000Z',
    description: 'Cafe',
    pending: false,
    connectedAccount: true,
    providerConnectionId: 'connection-a',
    providerAccountId: 'provider-a',
    sourceTransactionId: 'source-a',
  });
  const otherCandidate = createFinancialTransaction({
    id: otherCandidateId,
    accountId: otherAccountId,
    origin: 'simplefin',
    amountMinor: -500,
    currency: 'USD',
    transactedAt: '2026-01-03T00:00:00.000Z',
    description: 'Cafe',
    pending: false,
    connectedAccount: true,
    providerConnectionId: 'connection-b',
    providerAccountId: 'provider-b',
    sourceTransactionId: 'source-b',
  });
  repository.transactions.push(provisional, candidate, otherCandidate);
  repository.reviewIssues.set(
    reviewId,
    createImportReviewIssue({
      id: reviewId,
      accountId,
      kind: 'provisional-reconciliation',
      candidateIds: [provisionalId, candidateId],
      providerSourceIdentity: 'connection-a:provider-a:source-a',
    }),
  );
  repository.claimSourceIdentity('connection-a', 'connection-a:provider-a:source-a', candidateId);
  repository.claimSourceIdentity(
    'connection-b',
    'connection-b:provider-b:source-b',
    otherCandidateId,
  );
  return repository;
};

const decide = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  requestedCandidateId = candidateId,
) =>
  decideProviderReconciliation(
    repository,
    actor,
    provisionalId,
    {
      decision: 'reconcile',
      reviewIssueId: reviewId,
      candidateTransactionId: requestedCandidateId,
      expectedProvisionalVersion: 1,
      expectedCandidateVersion: 1,
      expectedReviewVersion: 1,
    },
    `decision-${actor.id}-${requestedCandidateId}`,
  );

describe('Finance reconciliation privacy boundaries', () => {
  it('rejects cross-account candidates without disclosing their existence or versions', () => {
    const repository = setup();
    const before = structuredClone(repository.transactions);

    expect(() => decide(repository, member, otherCandidateId)).toThrow('Finance record not found.');
    expect(repository.transactions).toEqual(before);
    expect(repository.transactionAliases.size).toBe(0);
  });

  it('uses the same generic response for an inaccessible candidate and a missing candidate', () => {
    const inaccessible = setup();
    const missing = setup();
    const capture = (work: () => unknown) => {
      try {
        work();
      } catch (error) {
        return (error as Error).message;
      }
      return 'unexpected success';
    };

    expect(capture(() => decide(inaccessible, member, otherCandidateId))).toBe(
      capture(() => decide(missing, member, '01J00000000000000000000599')),
    );
  });

  it('rejects revoked and nonmember reconciliation decisions identically', () => {
    const revoked = { ...member, active: false };
    const nonmember = { ...member, groupMemberships: [] };

    expect(() => decide(setup(), revoked)).toThrow('Finance record not found.');
    expect(() => decide(setup(), nonmember)).toThrow('Finance record not found.');
  });
});
