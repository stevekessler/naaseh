import {
  assertFinanceTransition,
  createFinancialAccount,
  createFinancialTransaction,
  createUlid,
  deriveCurrentBalance,
  financeAudience,
  insertBalanceSnapshot,
  type BalanceSnapshot,
  type FinanceScope,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';

export async function createManualAccount(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: Parameters<typeof createFinancialAccount>[0],
  mutationId: string,
) {
  const replay = repository.mutation<ReturnType<typeof createFinancialAccount>>(actor, mutationId);
  if (replay) return replay;
  if (!authorizeFinanceScope(actor, input.scope, 'connect').allowed)
    throw new Error('Finance record not found.');
  if (repository.accounts.has(input.id)) throw new Error('Account already exists.');
  const account = createFinancialAccount(input);
  const snapshot: BalanceSnapshot = {
    id: `${input.id}-opening`,
    accountId: input.id,
    balanceMinor: input.openingBalanceMinor,
    ...(input.availableBalanceMinor === undefined
      ? {}
      : { availableBalanceMinor: input.availableBalanceMinor }),
    currency: account.currency,
    currencyExponent: account.currencyExponent,
    effectiveAt: account.balanceAt,
    recordedAt: account.balanceAt,
    source: 'manual',
  };
  repository.accounts.set(account.id, account);
  repository.balanceSnapshots.push(snapshot);
  return repository.remember(actor.id, mutationId, account);
}

export async function recordManualBalance(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  accountId: string,
  input: {
    id: string;
    expectedAccountVersion: number;
    balanceMinor: number;
    availableBalanceMinor?: number;
    effectiveAt: string;
    recordedAt: string;
  },
  mutationId: string,
) {
  const replay = repository.mutation<{
    account: ReturnType<typeof createFinancialAccount>;
    snapshot: BalanceSnapshot;
  }>(actor, mutationId);
  if (replay) return replay;
  const account = repository.accounts.get(accountId);
  if (!account || !authorizeFinanceScope(actor, account.scope, 'edit').allowed)
    throw new Error('Finance record not found.');
  if (account.connectionId)
    throw new Error('Manual balance snapshots are not permitted for provider-managed accounts.');
  if (account.version !== input.expectedAccountVersion)
    throw new Error('Account version conflict.');
  const snapshot: BalanceSnapshot = {
    id: input.id,
    accountId,
    balanceMinor: input.balanceMinor,
    ...(input.availableBalanceMinor === undefined
      ? {}
      : { availableBalanceMinor: input.availableBalanceMinor }),
    currency: account.currency,
    currencyExponent: account.currencyExponent,
    effectiveAt: new Date(input.effectiveAt).toISOString(),
    recordedAt: new Date(input.recordedAt).toISOString(),
    source: 'manual',
  };
  const ownSnapshots = repository.balanceSnapshots.filter((item) => item.accountId === accountId);
  const insertion = insertBalanceSnapshot(ownSnapshots, snapshot);
  const ordered = [...insertion.snapshots].sort(
    (a, b) =>
      a.effectiveAt.localeCompare(b.effectiveAt) || a.recordedAt.localeCompare(b.recordedAt),
  );
  const latest = ordered.at(-1)!;
  const updated = {
    ...account,
    currentBalanceMinor: deriveCurrentBalance(
      insertion.snapshots,
      repository.transactions.filter((item) => item.accountId === accountId),
    ),
    balanceAt: latest.effectiveAt,
    version: account.version + (insertion.inserted ? 1 : 0),
  };
  if (latest.availableBalanceMinor === undefined) delete updated.availableBalanceMinor;
  else updated.availableBalanceMinor = latest.availableBalanceMinor;
  if (insertion.inserted) repository.balanceSnapshots.push(snapshot);
  repository.accounts.set(accountId, updated);
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeBalanceSnapshot',
    entityId: snapshot.id,
    version: 1,
    changedAt: snapshot.recordedAt,
    operation: 'upsert',
    payload: snapshot,
  });
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeAccount',
    entityId: accountId,
    version: updated.version,
    changedAt: snapshot.recordedAt,
    operation: 'upsert',
    payload: updated,
  });
  return repository.remember(actor.id, mutationId, { account: updated, snapshot });
}

export function changeAccountLifecycle(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  accountId: string,
  expectedVersion: number,
  status: 'active' | 'archived',
) {
  const account = repository.accounts.get(accountId);
  if (!account || !authorizeFinanceScope(actor, account.scope, 'delete').allowed) {
    throw new Error('Finance record not found.');
  }
  if (account.version !== expectedVersion) throw new Error('Account version conflict.');
  const updated = {
    ...account,
    status: assertFinanceTransition(account.status, status) as 'active' | 'archived',
    version: account.version + 1,
  };
  repository.accounts.set(accountId, updated);
  return updated;
}

export function completeSimplefinAccountIdentity(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  connectionId: string,
  providerAccountId: string,
  input: {
    scope: FinanceScope;
    sourceName: string;
    organizationName: string;
    friendlyName?: string;
  },
) {
  const connection = repository.connections.get(connectionId) as
    | { scope?: FinanceScope }
    | undefined;
  if (
    !connection?.scope ||
    !authorizeFinanceScope(actor, connection.scope, 'connect').allowed ||
    !authorizeFinanceScope(actor, input.scope, 'connect').allowed
  )
    throw new Error('Finance record not found.');
  const pendingKey = `${connectionId}:${providerAccountId}`;
  const pending = repository.pendingSimplefinAccounts.get(pendingKey);
  if (!pending) throw new Error('Finance record not found.');
  const actualProviderAccountId =
    typeof pending.providerAccountId === 'string' ? pending.providerAccountId : providerAccountId;
  const currency = typeof pending.currency === 'string' ? pending.currency : 'USD';
  const balanceMinor = typeof pending.balanceMinor === 'number' ? pending.balanceMinor : 0;
  const balanceAt =
    typeof pending.balanceAt === 'string' ? pending.balanceAt : new Date().toISOString();
  const accountId = createUlid();
  const account = createFinancialAccount({
    id: accountId,
    connectionId,
    scope: input.scope,
    sourceName: input.sourceName,
    organizationName: input.organizationName,
    ...(input.friendlyName ? { friendlyName: input.friendlyName } : {}),
    accountType: 'other',
    currency,
    openingBalanceMinor: balanceMinor,
    balanceAt,
  });
  repository.claimSourceIdentity(connectionId, `account:${providerAccountId}`, accountId);
  repository.accounts.set(accountId, account);
  repository.balanceSnapshots.push({
    id: createUlid(),
    accountId,
    balanceMinor,
    currency,
    currencyExponent: account.currencyExponent,
    effectiveAt: balanceAt,
    recordedAt: new Date().toISOString(),
    source: 'simplefin',
  });
  const transactions = Array.isArray(pending.transactions) ? pending.transactions : [];
  for (const value of transactions) {
    if (!value || typeof value !== 'object') continue;
    const transaction = value as Record<string, unknown>;
    if (
      typeof transaction.sourceTransactionId !== 'string' ||
      typeof transaction.amountMinor !== 'number' ||
      typeof transaction.description !== 'string'
    )
      continue;
    const id = createUlid();
    const providerConnectionId =
      typeof pending.providerConnectionId === 'string'
        ? pending.providerConnectionId
        : connectionId;
    repository.claimSourceIdentity(
      connectionId,
      `${providerConnectionId}:${actualProviderAccountId}:${transaction.sourceTransactionId}`,
      id,
    );
    repository.transactions.push(
      createFinancialTransaction({
        id,
        accountId,
        origin: 'simplefin',
        amountMinor: transaction.amountMinor,
        currency,
        ...(typeof transaction.postedAt === 'string' ? { postedAt: transaction.postedAt } : {}),
        ...(typeof transaction.transactedAt === 'string'
          ? { transactedAt: transaction.transactedAt }
          : typeof transaction.postedAt !== 'string'
            ? { transactedAt: balanceAt }
            : {}),
        description: transaction.description,
        ...(typeof transaction.payee === 'string' ? { payee: transaction.payee } : {}),
        pending: typeof transaction.pending === 'boolean' ? transaction.pending : false,
        connectedAccount: true,
        providerConnectionId,
        providerAccountId: actualProviderAccountId,
        sourceTransactionId: transaction.sourceTransactionId,
      }),
    );
  }
  repository.pendingSimplefinAccounts.delete(pendingKey);
  return account;
}
