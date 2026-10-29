import {
  createImportReviewIssue,
  createUlid,
  exactProviderCandidates,
  financeAudience,
  reconcileProviderTransaction,
  resolveImportReviewIssue,
  tombstoneFinancialTransaction,
  type FinancialTransaction,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';

type ReconciliationDecision = {
  decision: 'reconcile' | 'keep-separate';
  reviewIssueId: string;
  candidateTransactionId: string;
  expectedProvisionalVersion: number;
  expectedCandidateVersion: number;
  expectedReviewVersion: number;
};

const providerIdentity = (transaction: FinancialTransaction) => {
  if (!transaction.providerConnectionId || !transaction.sourceTransactionId) {
    throw new Error('Provider identity is incomplete.');
  }
  if (!transaction.providerAccountId) throw new Error('Provider identity is incomplete.');
  return {
    connectionId: transaction.providerConnectionId,
    sourceId: `${transaction.providerConnectionId}:${transaction.providerAccountId}:${transaction.sourceTransactionId}`,
  };
};

const transactionIndex = (repository: FinanceMemoryRepository, transactionId: string) =>
  repository.transactions.findIndex(
    ({ id }) => id === repository.resolveTransactionId(transactionId),
  );

const candidateHasUserState = (candidate: FinancialTransaction) =>
  candidate.allocations.length > 0 || Boolean(candidate.merchantId || candidate.transferId);

function applyReconciliation(
  repository: FinanceMemoryRepository,
  provisionalIndex: number,
  candidateIndex: number,
  actorId: string,
) {
  const provisional = repository.transactions[provisionalIndex]!;
  const candidate = repository.transactions[candidateIndex]!;
  if (candidateHasUserState(candidate))
    throw new Error('Provider candidate has user-owned state conflict.');
  const identity = providerIdentity(candidate);
  const { transaction } = reconcileProviderTransaction(provisional, candidate, actorId);
  repository.transferSourceIdentity(
    identity.connectionId,
    identity.sourceId,
    candidate.id,
    provisional.id,
  );
  repository.transactions[provisionalIndex] = transaction;
  repository.transactions[candidateIndex] = tombstoneFinancialTransaction(candidate);
  repository.transactionAliases.set(candidate.id, provisional.id);
  const account = repository.accounts.get(provisional.accountId)!;
  const changedAt = new Date().toISOString();
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeTransaction',
    entityId: transaction.id,
    version: transaction.version,
    changedAt,
    operation: 'upsert',
    payload: transaction,
  });
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeTransaction',
    entityId: candidate.id,
    version: candidate.version + 1,
    changedAt,
    operation: 'tombstone',
  });
  return transaction;
}

export function reconcileProviderImport(
  repository: FinanceMemoryRepository,
  provider: FinancialTransaction,
  actorId: string,
) {
  const identity = providerIdentity(provider);
  const owner = repository.sourceIdentities.get(`${identity.connectionId}:${identity.sourceId}`);
  if (owner && owner !== provider.id) {
    const canonical = repository.transactions.find(
      ({ id }) => id === repository.resolveTransactionId(owner),
    );
    if (!canonical) throw new Error('Finance source identity version conflict.');
    return canonical;
  }
  let candidateIndex = transactionIndex(repository, provider.id);
  if (candidateIndex < 0) {
    repository.transactions.push(provider);
    candidateIndex = repository.transactions.length - 1;
    repository.claimSourceIdentity(identity.connectionId, identity.sourceId, provider.id);
  }
  const candidates = exactProviderCandidates(
    repository.transactions.filter(
      (transaction) => transaction.id !== provider.id && transaction.status === 'active',
    ),
    provider,
  );
  if (candidates.length === 1) {
    const provisionalIndex = transactionIndex(repository, candidates[0]!.id);
    return applyReconciliation(repository, provisionalIndex, candidateIndex, actorId);
  }
  if (candidates.length > 0) {
    const account = repository.accounts.get(provider.accountId);
    if (account) {
      const issue = createImportReviewIssue({
        id: createUlid(),
        accountId: provider.accountId,
        kind: 'provisional-reconciliation',
        candidateIds: [...candidates.map(({ id }) => id), provider.id],
        providerSourceIdentity: `${identity.connectionId}:${identity.sourceId}`,
      });
      repository.reviewIssues.set(issue.id, issue);
      for (const candidate of candidates) {
        const index = transactionIndex(repository, candidate.id);
        repository.transactions[index] = {
          ...candidate,
          reconciliationState: 'review-required',
          reviewState: 'reconciliation-review',
          version: candidate.version + 1,
        };
      }
    }
  }
  return repository.transactions[candidateIndex]!;
}

export function decideProviderReconciliation(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  provisionalId: string,
  input: ReconciliationDecision,
  mutationId: string,
) {
  const replay = repository.mutation<FinancialTransaction>(actor.id, mutationId);
  if (replay) return replay;
  const provisionalIndex = transactionIndex(repository, provisionalId);
  const candidateIndex = transactionIndex(repository, input.candidateTransactionId);
  const provisional = repository.transactions[provisionalIndex];
  const candidate = repository.transactions[candidateIndex];
  const review = repository.reviewIssues.get(input.reviewIssueId);
  const account = provisional ? repository.accounts.get(provisional.accountId) : undefined;
  if (
    !provisional ||
    !candidate ||
    !review ||
    !account ||
    provisional.accountId !== candidate.accountId ||
    review.accountId !== provisional.accountId ||
    !review.candidateIds.includes(provisional.id) ||
    !review.candidateIds.includes(candidate.id) ||
    !authorizeFinanceScope(actor, account.scope, 'edit').allowed
  ) {
    throw new Error('Finance record not found.');
  }
  if (
    provisional.version !== input.expectedProvisionalVersion ||
    candidate.version !== input.expectedCandidateVersion ||
    review.version !== input.expectedReviewVersion
  ) {
    throw new Error('Provider reconciliation version conflict.');
  }
  const identity = providerIdentity(candidate);
  if (
    repository.sourceIdentities.get(`${identity.connectionId}:${identity.sourceId}`) !==
    candidate.id
  ) {
    throw new Error('Provider reconciliation version conflict.');
  }
  if (input.decision === 'keep-separate') {
    const updated = {
      ...provisional,
      reconciliationState: 'kept-separate' as const,
      reviewState: 'none' as const,
      version: provisional.version + 1,
    };
    repository.transactions[provisionalIndex] = updated;
    repository.keptSeparatePairs.add(
      `${provisional.id}:${identity.connectionId}:${identity.sourceId}`,
    );
    repository.reviewIssues.set(
      review.id,
      resolveImportReviewIssue(review, 'kept-separate', actor.id),
    );
    return repository.remember(actor.id, mutationId, updated);
  }
  const reconciled = applyReconciliation(repository, provisionalIndex, candidateIndex, actor.id);
  repository.reviewIssues.set(review.id, resolveImportReviewIssue(review, 'reconciled', actor.id));
  return repository.remember(actor.id, mutationId, reconciled);
}
