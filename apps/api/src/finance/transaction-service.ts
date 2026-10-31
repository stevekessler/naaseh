import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';
import { markFinanceBudgetsChangedByTransaction } from './reconciliation-service.js';
import {
  correctFinancialTransaction,
  createConfirmedTransfer,
  createFinancialTransaction,
  createImportReviewIssue,
  createUlid,
  financeAudience,
  invalidateTransfer,
  replaceTransactionAllocations,
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
  },
  mutationId: string,
) {
  const replay = repository.mutation<Record<string, unknown>>(actor.id, mutationId);
  if (replay) return replay;
  const account = repository.accounts.get(accountId);
  if (!account || !authorizeFinanceScope(actor, account.scope, 'edit').allowed)
    throw new Error('Finance record not found.');
  if (
    input.expectedAccountVersion !== undefined &&
    input.expectedAccountVersion !== account.version
  ) {
    throw new Error('Account version conflict.');
  }
  const transaction = createFinancialTransaction({
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
    pending: false,
    connectedAccount: Boolean(account.connectionId),
  });
  repository.transactions.push(transaction);
  if (transaction.effectiveAt > account.balanceAt) {
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
  const replay = repository.mutation<Record<string, unknown>>(actor.id, mutationId);
  if (replay) return replay;
  const {
    index,
    transaction: current,
    account,
  } = authorizeTransaction(repository, actor, transactionId);
  if (current.origin !== 'manual') throw new Error('Finance record not found.');
  if (current.version !== input.expectedVersion) throw new Error('Transaction version conflict.');
  const updated = correctFinancialTransaction(current, input);
  repository.transactions[index] = updated;
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

export async function replaceTransactionAllocationsForActor(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  input: { expectedVersion: number; allocations: readonly TransactionAllocationInput[] },
  mutationId: string,
) {
  const replay = repository.mutation<ReturnType<typeof replaceTransactionAllocations>>(
    actor.id,
    mutationId,
  );
  if (replay) return replay;
  const { index, transaction, account } = authorizeTransaction(repository, actor, transactionId);
  if (transaction.version !== input.expectedVersion)
    throw new Error('Transaction version conflict.');
  const updated = replaceTransactionAllocations(transaction, input.allocations, actor.id);
  repository.transactions[index] = updated;
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
  const replay = repository.mutation<(typeof repository.transactions)[number]>(
    actor.id,
    mutationId,
  );
  if (replay) return replay;
  const merchant = repository.merchants.get(merchantId);
  const { index, transaction, account } = authorizeTransaction(repository, actor, transactionId);
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
  input: { id: string; scope: FinanceScope; transactionIds: readonly string[] },
  mutationId: string,
) {
  const replay = repository.mutation<ReturnType<typeof createConfirmedTransfer>>(
    actor.id,
    mutationId,
  );
  if (replay) return replay;
  if (!authorizeFinanceScope(actor, input.scope, 'edit').allowed)
    throw new Error('Finance record not found.');
  const authorized = input.transactionIds.map((id) => authorizeTransaction(repository, actor, id));
  const legs = authorized.map(({ transaction }) => transaction);
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
