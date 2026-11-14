import {
  createExpenseRefundRelationship,
  createUlid,
  canContributeRefund,
  type ExpenseRefundRelationship,
  type FinancialTransaction,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import {
  refundAllocationCapacityKey,
  refundCapacityVersions,
  refundRelationshipForCredit,
  refundRelationshipsForOriginal,
  storeRefundRelationship,
} from './refund-repository.js';
import type { FinanceMemoryRepository } from './repository.js';

type RefundWriteInput = {
  id?: string;
  originalExpenseTransactionId: string;
  linkedAmountMinor: number;
  refundedAllocations?: readonly { originalAllocationId: string; amountMinor: number }[];
  confirmedPartialAllocations: boolean;
  expectedRefundVersion: number;
  expectedOriginalVersion: number;
  expectedRelationshipVersion?: number;
  expectedCreditCapacityVersion: number;
  expectedAllocationCapacityVersions: Readonly<Record<string, number>>;
};

const transactionFor = (repository: FinanceMemoryRepository, id: string) =>
  repository.transactions.find(({ id: candidate }) => candidate === repository.resolveTransactionId(id));

const authorizeTransaction = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  action: 'read' | 'edit',
): FinancialTransaction => {
  const transaction = transactionFor(repository, transactionId);
  const account = transaction ? repository.accounts.get(transaction.accountId) : undefined;
  if (!transaction || !account || !authorizeFinanceScope(actor, account.scope, action).allowed)
    throw new Error('Finance record not found.');
  return transaction;
};

const assertCapacityVersion = (actual: number, expected: number) => {
  if (actual !== expected) throw new Error('Refund capacity version conflict.');
};

const envelope = (
  repository: FinanceMemoryRepository,
  relationship: ExpenseRefundRelationship,
) => ({ relationship, ...refundCapacityVersions(repository, relationship) });

const recordRefundFeed = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  relationship: ExpenseRefundRelationship,
) =>
  repository.feedChanges.push({
    // Refund/original scope intersections do not map to one shared audience. Keep the
    // relationship on the protected initiating-recipient feed and recheck both sources on read.
    audience: `OWNER#${actor.id}`,
    entityType: 'financeRefundRelationship',
    entityId: relationship.id,
    version: relationship.version,
    changedAt: relationship.updatedAt,
    operation: relationship.status === 'removed' ? 'tombstone' : 'upsert',
    ...(relationship.status === 'active' ? { payload: relationship } : {}),
  });

export function getExpenseRefundRelationship(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  refundTransactionId: string,
) {
  let refund: FinancialTransaction;
  try {
    refund = authorizeTransaction(repository, actor, refundTransactionId, 'read');
  } catch {
    return undefined;
  }
  const relationship = refundRelationshipForCredit(repository, refund.id);
  if (!relationship || relationship.status !== 'active') return undefined;
  try {
    authorizeTransaction(repository, actor, relationship.originalExpenseTransactionId, 'read');
  } catch {
    return undefined;
  }
  return envelope(repository, relationship);
}

export function putExpenseRefundRelationship(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  refundTransactionId: string,
  input: RefundWriteInput,
  mutationId: string,
) {
  const refund = authorizeTransaction(repository, actor, refundTransactionId, 'edit');
  const original = authorizeTransaction(
    repository,
    actor,
    input.originalExpenseTransactionId,
    'read',
  );
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) {
    if (
      replay.relationship.refundTransactionId !== refund.id ||
      replay.relationship.originalExpenseTransactionId !== original.id
    )
      throw new Error('Refund relationship version conflict.');
    return replay;
  }
  if (refund.version !== input.expectedRefundVersion || original.version !== input.expectedOriginalVersion)
    throw new Error('Refund source version conflict.');
  const current = refundRelationshipForCredit(repository, refund.id);
  if (
    (current && input.expectedRelationshipVersion !== current.version) ||
    (!current && input.expectedRelationshipVersion !== undefined)
  )
    throw new Error('Refund relationship version conflict.');
  assertCapacityVersion(
    repository.refundCreditCapacityVersions.get(refund.id) ?? 0,
    input.expectedCreditCapacityVersion,
  );
  const proposedAllocationIds =
    input.refundedAllocations?.map(({ originalAllocationId }) => originalAllocationId) ??
    original.allocations.map(({ id }) => id);
  const touchedAllocationIds = new Set([
    ...proposedAllocationIds,
    ...(current?.refundedAllocations.map(({ originalAllocationId }) => originalAllocationId) ?? []),
  ]);
  for (const allocationId of touchedAllocationIds) {
    const expected = input.expectedAllocationCapacityVersions[allocationId];
    if (expected === undefined) throw new Error('Refund capacity version conflict.');
    assertCapacityVersion(
      repository.refundAllocationCapacityVersions.get(
        refundAllocationCapacityKey(original.id, allocationId),
      ) ?? 0,
      expected,
    );
  }
  const existing = refundRelationshipsForOriginal(repository, original.id).filter(
    ({ id }) => id !== current?.id,
  );
  const created = createExpenseRefundRelationship({
    id: current?.id ?? input.id ?? createUlid(),
    original,
    refund,
    linkedAmountMinor: input.linkedAmountMinor,
    ...(input.refundedAllocations ? { refundedAllocations: input.refundedAllocations } : {}),
    confirmedPartialAllocations: input.confirmedPartialAllocations,
    existing,
    budgetItems: [...repository.budgetItems.values()],
    actorId: actor.id,
  });
  const relationship: ExpenseRefundRelationship = current
    ? {
        ...created,
        id: current.id,
        createdAt: current.createdAt,
        version: current.version + 1,
      }
    : created;
  repository.refundCreditCapacityVersions.set(refund.id, input.expectedCreditCapacityVersion + 1);
  for (const allocationId of touchedAllocationIds) {
    repository.refundAllocationCapacityVersions.set(
      refundAllocationCapacityKey(original.id, allocationId),
      input.expectedAllocationCapacityVersions[allocationId]! + 1,
    );
  }
  storeRefundRelationship(repository, relationship);
  recordRefundFeed(repository, actor, relationship);
  return repository.remember(actor.id, mutationId, envelope(repository, relationship));
}

export function deleteExpenseRefundRelationship(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  refundTransactionId: string,
  input: {
    expectedRelationshipVersion: number;
    expectedCreditCapacityVersion: number;
    expectedAllocationCapacityVersions: Readonly<Record<string, number>>;
  },
  mutationId: string,
) {
  const refund = authorizeTransaction(repository, actor, refundTransactionId, 'edit');
  const current = refundRelationshipForCredit(repository, refund.id);
  if (!current) throw new Error('Finance record not found.');
  authorizeTransaction(repository, actor, current.originalExpenseTransactionId, 'read');
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) return replay;
  if (current.version !== input.expectedRelationshipVersion)
    throw new Error('Refund relationship version conflict.');
  assertCapacityVersion(
    repository.refundCreditCapacityVersions.get(refund.id) ?? 0,
    input.expectedCreditCapacityVersion,
  );
  for (const { originalAllocationId } of current.refundedAllocations) {
    const expected = input.expectedAllocationCapacityVersions[originalAllocationId];
    if (expected === undefined) throw new Error('Refund capacity version conflict.');
    assertCapacityVersion(
      repository.refundAllocationCapacityVersions.get(
        refundAllocationCapacityKey(current.originalExpenseTransactionId, originalAllocationId),
      ) ?? 0,
      expected,
    );
  }
  const relationship: ExpenseRefundRelationship = {
    ...current,
    status: 'removed',
    updatedAt: new Date().toISOString(),
    version: current.version + 1,
  };
  repository.refundCreditCapacityVersions.set(refund.id, input.expectedCreditCapacityVersion + 1);
  for (const { originalAllocationId } of current.refundedAllocations) {
    repository.refundAllocationCapacityVersions.set(
      refundAllocationCapacityKey(current.originalExpenseTransactionId, originalAllocationId),
      input.expectedAllocationCapacityVersions[originalAllocationId]! + 1,
    );
  }
  storeRefundRelationship(repository, relationship);
  recordRefundFeed(repository, actor, relationship);
  return repository.remember(actor.id, mutationId, envelope(repository, relationship));
}

/** Provider/source corrections are retained; incompatible accepted claims stop contributing. */
export function reviewRefundRelationshipsForTransaction(
  repository: FinanceMemoryRepository,
  transactionId: string,
) {
  const canonicalId = repository.resolveTransactionId(transactionId);
  for (const [id, relationship] of repository.refundRelationships) {
    if (
      relationship.status !== 'active' ||
      (relationship.refundTransactionId !== canonicalId &&
        relationship.originalExpenseTransactionId !== canonicalId)
    )
      continue;
    const refund = transactionFor(repository, relationship.refundTransactionId);
    const original = transactionFor(repository, relationship.originalExpenseTransactionId);
    if (!refund || !original || !canContributeRefund(relationship, refund, original)) {
      repository.refundRelationships.set(id, {
        ...relationship,
        calculationState: 'needs-review',
        updatedAt: new Date().toISOString(),
        version: relationship.version + 1,
      });
    }
  }
}
