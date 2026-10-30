import { describe, expect, it } from 'vitest';
import {
  createFinancialAccount,
  createFinancialTransaction,
  createImportReviewIssue,
} from '@naaseh/domain';
import type { FinanceActor } from '../../apps/api/src/finance/authorization.js';
import { FinanceMemoryRepository } from '../../apps/api/src/finance/repository.js';
import {
  decideProviderReconciliation,
  reconcileProviderImport,
} from '../../apps/api/src/finance/provider-reconciliation-service.js';

const ids = {
  account: '01J00000000000000000000301',
  provisional: '01J00000000000000000000311',
  candidate: '01J00000000000000000000312',
  review: '01J00000000000000000000321',
};
const actor: FinanceActor = { id: 'owner-a', role: 'user', active: true, groupMemberships: [] };

const setup = () => {
  const repository = new FinanceMemoryRepository();
  repository.accounts.set(
    ids.account,
    createFinancialAccount({
      id: ids.account,
      connectionId: 'connection-a',
      scope: { type: 'owner', ownerId: actor.id },
      sourceName: 'Checking',
      organizationName: 'Fixture Bank',
      accountType: 'checking',
      currency: 'USD',
      openingBalanceMinor: 10_000,
      balanceAt: '2026-01-01T00:00:00.000Z',
    }),
  );
  const provisional = createFinancialTransaction({
    id: ids.provisional,
    accountId: ids.account,
    origin: 'manual',
    amountMinor: -1_000,
    currency: 'USD',
    transactedAt: '2026-01-05T12:00:00.000Z',
    description: 'Fixture Cafe',
    pending: false,
    connectedAccount: true,
  });
  const candidate = createFinancialTransaction({
    id: ids.candidate,
    accountId: ids.account,
    origin: 'simplefin',
    amountMinor: -1_000,
    currency: 'USD',
    transactedAt: '2026-01-06T12:00:00.000Z',
    description: 'FIXTURE CAFE',
    pending: false,
    connectedAccount: true,
    providerConnectionId: 'connection-a',
    providerAccountId: 'provider-account-a',
    sourceTransactionId: 'provider-transaction-a',
  });
  repository.transactions.push(provisional, candidate);
  repository.claimSourceIdentity(
    'connection-a',
    'connection-a:provider-account-a:provider-transaction-a',
    candidate.id,
  );
  return { repository, provisional, candidate };
};

describe('SimpleFIN provider reconciliation service', () => {
  it('atomically attaches a unique exact import and keeps replay on one canonical transaction', () => {
    const { repository, candidate } = setup();
    const reconciled = reconcileProviderImport(repository, candidate, 'system');
    expect(reconciled).toMatchObject({
      id: ids.provisional,
      origin: 'manual',
      reconciliationState: 'reconciled',
    });
    expect(
      repository.sourceIdentities.get(
        'connection-a:connection-a:provider-account-a:provider-transaction-a',
      ),
    ).toBe(ids.provisional);
    expect(repository.transactionAliases.get(ids.candidate)).toBe(ids.provisional);
    expect(reconcileProviderImport(repository, candidate, 'system').id).toBe(ids.provisional);
  });

  it('checks every version before explicit reconciliation and leaves no partial changes on conflict', () => {
    const { repository, provisional, candidate } = setup();
    repository.reviewIssues.set(
      ids.review,
      createImportReviewIssue({
        id: ids.review,
        accountId: ids.account,
        kind: 'provisional-reconciliation',
        candidateIds: [provisional.id, candidate.id],
        providerSourceIdentity: 'provider-transaction-a',
      }),
    );
    expect(() =>
      decideProviderReconciliation(
        repository,
        actor,
        provisional.id,
        {
          decision: 'reconcile',
          reviewIssueId: ids.review,
          candidateTransactionId: candidate.id,
          expectedProvisionalVersion: 99,
          expectedCandidateVersion: 1,
          expectedReviewVersion: 1,
        },
        'reconcile-conflict',
      ),
    ).toThrow(/version conflict/i);
    expect(
      repository.sourceIdentities.get(
        'connection-a:connection-a:provider-account-a:provider-transaction-a',
      ),
    ).toBe(candidate.id);
    expect(repository.transactionAliases.has(candidate.id)).toBe(false);

    const result = decideProviderReconciliation(
      repository,
      actor,
      provisional.id,
      {
        decision: 'reconcile',
        reviewIssueId: ids.review,
        candidateTransactionId: candidate.id,
        expectedProvisionalVersion: 1,
        expectedCandidateVersion: 1,
        expectedReviewVersion: 1,
      },
      'reconcile-success',
    );
    expect(
      decideProviderReconciliation(
        repository,
        actor,
        provisional.id,
        {
          decision: 'reconcile',
          reviewIssueId: ids.review,
          candidateTransactionId: candidate.id,
          expectedProvisionalVersion: 1,
          expectedCandidateVersion: 1,
          expectedReviewVersion: 1,
        },
        'reconcile-success',
      ),
    ).toEqual(result);
    expect(repository.reviewIssues.get(ids.review)).toMatchObject({
      status: 'resolved',
      decision: 'reconciled',
    });
  });
});
