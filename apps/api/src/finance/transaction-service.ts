import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { claimFinanceMerchantKey, FinanceMemoryRepository } from './repository.js';
import { isDeepStrictEqual } from 'node:util';
import { markFinanceBudgetsChangedByTransaction } from './reconciliation-service.js';
import { reviewRefundRelationshipsForTransaction } from './refund-service.js';
import {
  correctFinancialTransaction,
  createConfirmedTransfer,
  createFinancialTransaction,
  createImportReviewIssue,
  createUlid,
  financeAudience,
  invalidateTransfer,
  replaceTransactionAllocations,
  updateMerchant,
  withAllocationClassification,
  type FinanceScope,
  type FinancialAccount,
  type FinancialTransaction,
  type TransactionAllocationInput,
} from '@naaseh/domain';

const transactionFor = (repository: FinanceMemoryRepository, transactionId: string) => {
  const resolvedId = repository.resolveTransactionId(transactionId);
  const index = repository.transactions.findIndex(({ id }) => id === resolvedId);
  return { index, transaction: repository.transactions[index] };
};

const authorizeTransaction = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
): { index: number; transaction: FinancialTransaction; account: FinancialAccount } => {
  const found = transactionFor(repository, transactionId);
  const account = found.transaction
    ? repository.accounts.get(found.transaction.accountId)
    : undefined;
  if (
    !found.transaction ||
    !account ||
    !authorizeFinanceScope(actor, account.scope, 'edit').allowed
  ) {
    throw new Error('Finance record not found.');
  }
  return { index: found.index, transaction: found.transaction, account };
};

const recordTransactionFeed = (
  repository: FinanceMemoryRepository,
  account: FinancialAccount,
  transaction: FinancialTransaction,
) =>
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeTransaction',
    entityId: transaction.id,
    version: transaction.version,
    changedAt: new Date().toISOString(),
    operation: 'upsert',
    payload: transaction,
  });

const assertTransactionReplay = (
  replay: FinancialTransaction,
  id: string,
  accountId: string,
  version: number,
) => {
  if (replay.id !== id || replay.accountId !== accountId || replay.version !== version)
    throw new Error('Transaction version conflict.');
};

export function updateFinanceMerchant(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  merchantId: string,
  input: {
    expectedVersion: number;
    name?: string;
    city?: string | null;
    region?: string | null;
    financeCategoryId?: string | null;
  },
  mutationId: string,
) {
  const current = repository.merchants.get(merchantId);
  if (!current) throw new Error('Finance record not found.');
  const replay = repository.mutation<ReturnType<typeof updateMerchant>>(actor.id, mutationId);
  if (replay) {
    if (replay.id !== merchantId || replay.version !== input.expectedVersion + 1)
      throw new Error('Finance merchant version conflict.');
    return replay;
  }
  if (current.version !== input.expectedVersion)
    throw new Error('Finance merchant version conflict.');
  const updated = updateMerchant(current, input, actor);
  claimFinanceMerchantKey(repository, updated.canonicalKey, updated.id);
  if (
    current.canonicalKey !== updated.canonicalKey &&
    repository.merchantKeyLocks.get(current.canonicalKey) === current.id
  ) {
    repository.merchantKeyLocks.delete(current.canonicalKey);
  }
  repository.merchants.set(updated.id, updated);
  return repository.remember(actor.id, mutationId, updated);
}

export async function createManualTransaction(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  accountId: string,
  input: {
    id: string;
    expectedAccountVersion?: number;
    amountMinor: number;
    transactedAt: string;
    postedAt?: string;
    description: string;
    payee?: string;
    memo?: string;
    merchantId?: string;
    paymentType?: string;
    checkNumber?: string;
    allocations?: readonly {
      id: string;
      amountMinor: number;
      financeCategoryId: string;
      subcategoryId?: string | undefined;
      budgetItemId?: string | undefined;
      note?: string | undefined;
    }[];
  },
  mutationId: string,
) {
  const account = repository.accounts.get(accountId);
  if (
    !account ||
    !['active', 'attention'].includes(account.status) ||
    !authorizeFinanceScope(actor, account.scope, 'edit').allowed
  )
    throw new Error('Finance record not found.');
  if (input.amountMinor === 0) throw new Error('Transaction amount must be non-zero.');
  if (input.merchantId) {
    const merchant = repository.merchants.get(input.merchantId);
    if (!merchant || merchant.status !== 'active') throw new Error('Finance record not found.');
  }
  const allocations = (input.allocations ?? []).map((allocation) => {
    const category = repository.categories.get(allocation.financeCategoryId);
    const subcategory = allocation.subcategoryId
      ? repository.categories.get(allocation.subcategoryId)
      : undefined;
    if (!category || (allocation.subcategoryId && !subcategory))
      throw new Error('Finance record not found.');
    const normalized: TransactionAllocationInput = {
      id: allocation.id,
      amountMinor: allocation.amountMinor,
      financeCategoryId: allocation.financeCategoryId,
      ...(allocation.subcategoryId ? { subcategoryId: allocation.subcategoryId } : {}),
      ...(allocation.budgetItemId ? { budgetItemId: allocation.budgetItemId } : {}),
      ...(allocation.note ? { note: allocation.note } : {}),
    };
    return withAllocationClassification(normalized, category, subcategory);
  });
  const baseCandidate = createFinancialTransaction({
    id: input.id,
    accountId,
    origin: 'manual',
    amountMinor: input.amountMinor,
    currency: account.currency,
    transactedAt: input.transactedAt,
    ...(input.postedAt ? { postedAt: input.postedAt } : {}),
    description: input.description,
    ...(input.payee ? { payee: input.payee } : {}),
    ...(input.memo ? { memo: input.memo } : {}),
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    ...(input.paymentType ? { paymentType: input.paymentType } : {}),
    ...(input.checkNumber ? { checkNumber: input.checkNumber } : {}),
    pending: false,
    connectedAccount: Boolean(account.connectionId),
  });
  const candidate = allocations.length
    ? { ...replaceTransactionAllocations(baseCandidate, allocations, actor.id), version: 1 }
    : baseCandidate;
  const allocationIntent = (transaction: FinancialTransaction) =>
    transaction.allocations.map(
      ({
        id,
        amountMinor,
        financeCategoryId,
        subcategoryId,
        classification,
        budgetItemId,
        note,
        createdBy,
      }) => ({
        id,
        amountMinor,
        financeCategoryId,
        subcategoryId,
        classification,
        budgetItemId,
        note,
        createdBy,
      }),
    );
  const replay = repository.mutation<FinancialTransaction>(actor.id, mutationId);
  if (replay) {
    const sameIntent =
      replay.accountId === accountId &&
      replay.origin === 'manual' &&
      replay.version === 1 &&
      replay.amountMinor === candidate.amountMinor &&
      replay.currency === candidate.currency &&
      replay.postedAt === candidate.postedAt &&
      replay.transactedAt === candidate.transactedAt &&
      replay.description === candidate.description &&
      replay.payee === candidate.payee &&
      replay.memo === candidate.memo &&
      replay.paymentType === candidate.paymentType &&
      replay.checkNumber === candidate.checkNumber &&
      replay.merchantId === candidate.merchantId &&
      isDeepStrictEqual(allocationIntent(replay), allocationIntent(candidate)) &&
      replay.pending === candidate.pending &&
      replay.reconciliationState === candidate.reconciliationState;
    if (!sameIntent) throw new Error('Transaction version conflict.');
    return replay;
  }
  if (
    input.expectedAccountVersion !== undefined &&
    input.expectedAccountVersion !== account.version
  ) {
    throw new Error('Account version conflict.');
  }
  if (repository.transactions.some(({ id }) => id === candidate.id))
    throw new Error('Transaction version conflict.');
  const transaction = candidate;
  repository.transactions.push(transaction);
  if (!account.connectionId && transaction.effectiveAt > account.balanceAt) {
    repository.accounts.set(accountId, {
      ...account,
      currentBalanceMinor: account.currentBalanceMinor + input.amountMinor,
      version: account.version + 1,
    });
  }
  recordTransactionFeed(repository, account, transaction);
  return repository.remember(actor.id, mutationId, transaction);
}

export async function updateManualTransaction(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  input: {
    expectedVersion: number;
    amountMinor?: number;
    transactedAt?: string;
    postedAt?: string;
    description?: string;
    payee?: string;
    memo?: string;
  },
  mutationId: string,
) {
  const {
    index,
    transaction: current,
    account,
  } = authorizeTransaction(repository, actor, transactionId);
  if (current.origin !== 'manual') throw new Error('Finance record not found.');
  const replay = repository.mutation<FinancialTransaction>(actor.id, mutationId);
  if (replay) {
    assertTransactionReplay(replay, current.id, account.id, input.expectedVersion + 1);
    return replay;
  }
  if (current.version !== input.expectedVersion) throw new Error('Transaction version conflict.');
  const updated = correctFinancialTransaction(current, input);
  repository.transactions[index] = updated;
  reviewRefundRelationshipsForTransaction(repository, updated.id);
  markFinanceBudgetsChangedByTransaction(repository, current);
  if (updated.reviewState === 'allocation-review' && current.reviewState !== 'allocation-review') {
    const issue = createImportReviewIssue({
      id: createUlid(),
      accountId: current.accountId,
      kind: 'allocation-invalidated',
      candidateIds: [current.id],
    });
    repository.reviewIssues.set(issue.id, issue);
  }
  if (current.transferId) {
    const transfer = repository.transfers.get(current.transferId);
    if (transfer) repository.transfers.set(transfer.id, invalidateTransfer(transfer));
  }
  if (updated.effectiveAt > account.balanceAt && updated.amountMinor !== current.amountMinor) {
    repository.accounts.set(account.id, {
      ...account,
      currentBalanceMinor: account.currentBalanceMinor + updated.amountMinor - current.amountMinor,
      version: account.version + 1,
    });
  }
  recordTransactionFeed(repository, account, updated);
  return repository.remember(actor.id, mutationId, updated);
}

export async function updateTransactionPaymentMetadata(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  input: {
    expectedVersion: number;
    paymentType?: string | null;
    checkNumber?: string | null;
  },
  mutationId: string,
) {
  const { index, transaction, account } = authorizeTransaction(repository, actor, transactionId);
  const replay = repository.mutation<FinancialTransaction>(actor.id, mutationId);
  if (replay) {
    assertTransactionReplay(replay, transaction.id, account.id, input.expectedVersion + 1);
    return replay;
  }
  if (transaction.version !== input.expectedVersion)
    throw new Error('Transaction version conflict.');
  const updated = correctFinancialTransaction(transaction, input);
  repository.transactions[index] = updated;
  reviewRefundRelationshipsForTransaction(repository, updated.id);
  recordTransactionFeed(repository, account, updated);
  return repository.remember(actor.id, mutationId, updated);
}

export async function replaceTransactionAllocationsForActor(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  input: { expectedVersion: number; allocations: readonly TransactionAllocationInput[] },
  mutationId: string,
) {
  const { index, transaction, account } = authorizeTransaction(repository, actor, transactionId);
  const replay = repository.mutation<FinancialTransaction>(actor.id, mutationId);
  if (replay) {
    assertTransactionReplay(replay, transaction.id, account.id, input.expectedVersion + 1);
    return replay;
  }
  if (transaction.version !== input.expectedVersion)
    throw new Error('Transaction version conflict.');
  const allocations = input.allocations.map((allocation) => {
    const category = repository.categories.get(allocation.financeCategoryId);
    const subcategory = allocation.subcategoryId
      ? repository.categories.get(allocation.subcategoryId)
      : undefined;
    if (allocation.subcategoryId && (!category || !subcategory))
      throw new Error('Finance record not found.');
    return category ? withAllocationClassification(allocation, category, subcategory) : allocation;
  });
  const updated = replaceTransactionAllocations(transaction, allocations, actor.id);
  repository.transactions[index] = updated;
  reviewRefundRelationshipsForTransaction(repository, updated.id);
  markFinanceBudgetsChangedByTransaction(repository, transaction);
  markFinanceBudgetsChangedByTransaction(repository, updated);
  recordTransactionFeed(repository, account, updated);
  return repository.remember(actor.id, mutationId, updated);
}

export async function associateTransactionMerchant(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  merchantId: string,
  expectedVersion: number,
  mutationId: string,
) {
  const { index, transaction, account } = authorizeTransaction(repository, actor, transactionId);
  const replay = repository.mutation<FinancialTransaction>(actor.id, mutationId);
  if (replay) {
    assertTransactionReplay(replay, transaction.id, account.id, expectedVersion + 1);
    if (replay.merchantId !== merchantId) throw new Error('Transaction version conflict.');
    return replay;
  }
  const merchant = repository.merchants.get(merchantId);
  if (!merchant || merchant.status !== 'active' || transaction.version !== expectedVersion) {
    throw new Error(merchant ? 'Transaction version conflict.' : 'Finance record not found.');
  }
  const updated = { ...transaction, merchantId, version: transaction.version + 1 };
  repository.transactions[index] = updated;
  recordTransactionFeed(repository, account, updated);
  return repository.remember(actor.id, mutationId, updated);
}

export async function confirmTransactionTransfer(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: {
    id: string;
    scope: FinanceScope;
    transactionIds: readonly string[];
    expectedVersions?: readonly number[];
  },
  mutationId: string,
) {
  if (!authorizeFinanceScope(actor, input.scope, 'edit').allowed)
    throw new Error('Finance record not found.');
  const authorized = input.transactionIds.map((id) => authorizeTransaction(repository, actor, id));
  const legs = authorized.map(({ transaction }) => transaction);
  const replay = repository.mutation<ReturnType<typeof createConfirmedTransfer>>(
    actor.id,
    mutationId,
  );
  if (replay) {
    if (
      replay.id !== input.id ||
      !replay.scope ||
      financeAudience(replay.scope) !== financeAudience(input.scope) ||
      replay.legTransactionIds?.length !== legs.length ||
      legs.some((leg, index) => replay.legTransactionIds[index] !== leg.id)
    )
      throw new Error('Transfer version conflict.');
    return replay;
  }
  const expected = input.expectedVersions;
  if (
    expected &&
    (expected.length !== legs.length ||
      legs.some(({ version }, index) => version !== expected[index]))
  )
    throw new Error('Transfer version conflict.');
  if (legs.some(({ transferId }) => transferId && transferId !== input.id))
    throw new Error('Transaction already belongs to a transfer.');
  const transfer = createConfirmedTransfer(
    { id: input.id, scope: input.scope, createdBy: actor.id },
    legs,
  );
  repository.transfers.set(transfer.id, transfer);
  for (const { index, transaction, account } of authorized) {
    const updated = { ...transaction, transferId: transfer.id, version: transaction.version + 1 };
    repository.transactions[index] = updated;
    markFinanceBudgetsChangedByTransaction(repository, updated);
    recordTransactionFeed(repository, account, updated);
  }
  return repository.remember(actor.id, mutationId, transfer);
}

const canReadAccount = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  accountId: string,
) => {
  const account = repository.accounts.get(accountId);
  return Boolean(account && authorizeFinanceScope(actor, account.scope, 'read').allowed);
};

export function searchAuthorizedTransactions(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: { query: string; accountId?: string; limit?: number },
) {
  const query = input.query.normalize('NFC').toLocaleLowerCase('und').trim();
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const items = repository.transactions
    .filter(
      (transaction) =>
        transaction.status === 'active' &&
        (!input.accountId || transaction.accountId === input.accountId) &&
        canReadAccount(repository, actor, transaction.accountId) &&
        [transaction.description, transaction.payee, transaction.memo].some((value) =>
          value?.normalize('NFC').toLocaleLowerCase('und').includes(query),
        ),
    )
    .sort(
      (left, right) =>
        right.effectiveAt.localeCompare(left.effectiveAt) || right.id.localeCompare(left.id),
    )
    .slice(0, limit);
  return { items, cursor: null, totalsComplete: true };
}

export function readAuthorizedMerchantActivity(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  merchantId: string,
) {
  const merchant = repository.merchants.get(merchantId);
  if (!merchant) throw new Error('Finance record not found.');
  const transactions = repository.transactions
    .filter(
      (transaction) =>
        transaction.status === 'active' &&
        transaction.merchantId === merchantId &&
        canReadAccount(repository, actor, transaction.accountId),
    )
    .sort(
      (left, right) =>
        right.effectiveAt.localeCompare(left.effectiveAt) || right.id.localeCompare(left.id),
    );
  return { merchant, transactions, totalsComplete: true as const, cursor: null };
}
