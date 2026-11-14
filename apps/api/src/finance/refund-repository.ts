import type { ExpenseRefundRelationship } from '@naaseh/domain';
import type { FinanceMemoryRepository } from './repository.js';

export const refundAllocationCapacityKey = (originalId: string, allocationId: string) =>
  `${originalId}:${allocationId}`;

export const refundRelationshipForCredit = (
  repository: FinanceMemoryRepository,
  refundTransactionId: string,
) => {
  const relationshipId = repository.refundRelationshipByCredit.get(refundTransactionId);
  return relationshipId ? repository.refundRelationships.get(relationshipId) : undefined;
};

export const refundRelationshipsForOriginal = (
  repository: FinanceMemoryRepository,
  originalExpenseTransactionId: string,
) =>
  [...repository.refundRelationships.values()].filter(
    (relationship) => relationship.originalExpenseTransactionId === originalExpenseTransactionId,
  );

export function storeRefundRelationship(
  repository: FinanceMemoryRepository,
  relationship: ExpenseRefundRelationship,
) {
  repository.refundRelationships.set(relationship.id, relationship);
  repository.refundRelationshipByCredit.set(relationship.refundTransactionId, relationship.id);
}

export const refundCapacityVersions = (
  repository: FinanceMemoryRepository,
  relationship: ExpenseRefundRelationship,
) => ({
  creditCapacityVersion:
    repository.refundCreditCapacityVersions.get(relationship.refundTransactionId) ?? 0,
  allocationCapacityVersions: Object.fromEntries(
    relationship.refundedAllocations.map(({ originalAllocationId }) => [
      originalAllocationId,
      repository.refundAllocationCapacityVersions.get(
        refundAllocationCapacityKey(
          relationship.originalExpenseTransactionId,
          originalAllocationId,
        ),
      ) ?? 0,
    ]),
  ),
});

export function reconcileRefundTransactionAlias(
  repository: FinanceMemoryRepository,
  fromTransactionId: string,
  toTransactionId: string,
) {
  for (const [id, relationship] of repository.refundRelationships) {
    const refundAlias = relationship.refundTransactionId === fromTransactionId;
    const originalAlias = relationship.originalExpenseTransactionId === fromTransactionId;
    if (!refundAlias && !originalAlias) continue;
    const updated = {
      ...relationship,
      ...(refundAlias ? { refundTransactionId: toTransactionId } : {}),
      ...(originalAlias ? { originalExpenseTransactionId: toTransactionId } : {}),
      updatedAt: new Date().toISOString(),
      version: relationship.version + 1,
    };
    repository.refundRelationships.set(id, updated);
    if (refundAlias) {
      repository.refundRelationshipByCredit.delete(fromTransactionId);
      repository.refundRelationshipByCredit.set(toTransactionId, id);
      const version = repository.refundCreditCapacityVersions.get(fromTransactionId);
      if (version !== undefined) {
        repository.refundCreditCapacityVersions.delete(fromTransactionId);
        repository.refundCreditCapacityVersions.set(toTransactionId, version);
      }
    }
    if (originalAlias) {
      for (const { originalAllocationId } of relationship.refundedAllocations) {
        const prior = refundAllocationCapacityKey(fromTransactionId, originalAllocationId);
        const next = refundAllocationCapacityKey(toTransactionId, originalAllocationId);
        const version = repository.refundAllocationCapacityVersions.get(prior);
        if (version !== undefined) {
          repository.refundAllocationCapacityVersions.delete(prior);
          repository.refundAllocationCapacityVersions.set(next, version);
        }
      }
    }
  }
}
