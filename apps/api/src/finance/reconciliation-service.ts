import {
  calculateBudgetTotals,
  canonicalBudgetReconciliationSource,
  createBudgetReconciliation,
  digestBudgetReconciliationSource,
  financeAudience,
  markBudgetChangedSinceReconciliation,
  markBudgetReconciled,
  type Budget,
  type BudgetReconciliationSource,
  type FinancialTransaction,
  type ReconciliationRecord,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';

const scopeFor = (budget: Budget) => ({ type: 'group' as const, groupId: budget.groupId });

const authorizedBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
) => {
  const budget = repository.budgets.get(budgetId);
  if (
    !budget ||
    budget.status === 'tombstone' ||
    budget.status === 'archived' ||
    !authorizeFinanceScope(actor, scopeFor(budget), 'edit').allowed
  ) {
    throw new Error('Finance record not found.');
  }
  return budget;
};

const recordBudgetFeed = (repository: FinanceMemoryRepository, budget: Budget) => {
  repository.feedChanges.push({
    audience: financeAudience(scopeFor(budget)),
    entityType: 'financeBudget',
    entityId: budget.id,
    version: budget.version,
    changedAt: new Date().toISOString(),
    operation: 'upsert',
    payload: budget,
  });
};

interface ReconciliationSnapshot {
  budget: Budget;
  source: BudgetReconciliationSource;
  totals: ReturnType<typeof calculateBudgetTotals>;
  reasons: string[];
}

function reconciliationSnapshot(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budget: Budget,
): ReconciliationSnapshot {
  const links = [...repository.budgetAccountLinks.values()].filter(
    (link) => link.budgetId === budget.id && link.status === 'active',
  );
  const accounts = links.map((link) => repository.accounts.get(link.accountId));
  const completeAccess =
    links.length > 0 &&
    accounts.every(
      (account) =>
        account?.status === 'active' && authorizeFinanceScope(actor, account.scope, 'read').allowed,
    );
  if (!completeAccess)
    return {
      budget,
      source: { accounts: [], links: [], items: [], transactions: [] },
      totals: { byCurrency: [], byCategory: [], totalsComplete: false },
      reasons: ['Complete access to every linked account is required.'],
    };

  const activeAccounts = accounts.flatMap((account) => (account ? [account] : []));
  const accountIds = new Set(activeAccounts.map(({ id }) => id));
  const items = [...repository.budgetItems.values()].filter(
    (item) => item.budgetId === budget.id && item.status === 'active',
  );
  const itemIds = new Set(items.map(({ id }) => id));
  const transactions = repository.transactions.filter(
    (transaction) =>
      transaction.status === 'active' &&
      accountIds.has(transaction.accountId) &&
      transaction.allocations.some(({ budgetItemId }) => budgetItemId && itemIds.has(budgetItemId)),
  );
  const reasons: string[] = [];
  if (transactions.length === 0)
    reasons.push('At least one reviewed contributing transaction is required.');
  if (
    transactions.some(
      (transaction) =>
        transaction.reviewState === 'allocation-review' ||
        transaction.allocations.reduce((sum, allocation) => sum + allocation.amountMinor, 0) !==
          transaction.amountMinor,
    )
  ) {
    reasons.push('Every contributing transaction allocation must be valid and reviewed.');
  }
  const connectionIds = new Set(
    activeAccounts.flatMap(({ connectionId }) => (connectionId ? [connectionId] : [])),
  );
  if (
    [...repository.importJobs.values()].some(
      (job) =>
        connectionIds.has(job.connectionId) &&
        (job.status === 'queued' || job.status === 'running'),
    )
  ) {
    reasons.push('Wait for linked account refreshes to finish.');
  }
  const confirmedTransferIds = [...repository.transfers.values()]
    .filter(({ status }) => status === 'confirmed')
    .map(({ id }) => id);
  const totals = calculateBudgetTotals({
    items,
    links,
    visibleAccountIds: [...accountIds],
    transactions,
    confirmedTransferIds,
  });
  if (!totals.totalsComplete) reasons.push('Complete access to every linked account is required.');
  return {
    budget,
    totals,
    reasons,
    source: {
      accounts: activeAccounts.map(({ id, version }) => ({ id, version })),
      links: links.map(({ id, accountId, version }) => ({ id, accountId, version })),
      items: items.map(({ id, version }) => ({ id, version })),
      transactions: transactions.map(({ id, accountId, version, allocations }) => ({
        id,
        accountId,
        version,
        allocations: allocations.map(
          ({ id: allocationId, budgetItemId, amountMinor, financeCategoryId }) => ({
            id: allocationId,
            amountMinor,
            financeCategoryId,
            ...(budgetItemId ? { budgetItemId } : {}),
          }),
        ),
      })),
    },
  };
}

export function financeBudgetReconciliationReadiness(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
) {
  const snapshot = reconciliationSnapshot(
    repository,
    actor,
    authorizedBudget(repository, actor, budgetId),
  );
  return { canReconcile: snapshot.reasons.length === 0, reasons: snapshot.reasons };
}

export function listBudgetReconciliationHistory(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
) {
  authorizedBudget(repository, actor, budgetId);
  return repository.budgetReconciliations
    .filter((record) => record.budgetId === budgetId)
    .sort(
      (left, right) =>
        right.reconciledAt.localeCompare(left.reconciledAt) || right.id.localeCompare(left.id),
    );
}

export async function reconcileFinanceBudget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: { id: string; expectedVersion: number },
  mutationId: string,
  now = new Date(),
) {
  const replay = repository.mutation<ReconciliationRecord>(actor.id, mutationId);
  if (replay) return replay;
  const budget = authorizedBudget(repository, actor, budgetId);
  if (budget.version !== input.expectedVersion) throw new Error('Budget version conflict.');
  const snapshot = reconciliationSnapshot(repository, actor, budget);
  if (snapshot.reasons[0] === 'Complete access to every linked account is required.') {
    throw new Error('Budget reconciliation requires a complete authorized view.');
  }
  if (snapshot.reasons.length) throw new Error(snapshot.reasons[0]);
  const canonical = canonicalBudgetReconciliationSource(snapshot.source);
  const sourceVersionDigest = await digestBudgetReconciliationSource(snapshot.source);

  const currentBudget = authorizedBudget(repository, actor, budgetId);
  const currentSnapshot = reconciliationSnapshot(repository, actor, currentBudget);
  if (
    currentBudget.version !== input.expectedVersion ||
    currentSnapshot.reasons.length ||
    canonicalBudgetReconciliationSource(currentSnapshot.source) !== canonical
  ) {
    throw new Error('Budget version conflict.');
  }

  const reconciledAt = now.toISOString();
  const record = createBudgetReconciliation({
    id: input.id,
    budgetId,
    reconciledAt,
    reconciledBy: actor.id,
    budgetVersion: input.expectedVersion,
    sourceVersionDigest,
    totalsByCurrency: snapshot.totals.byCurrency,
    totalsByCategory: snapshot.totals.byCategory,
  });
  const updatedBudget = markBudgetReconciled(currentBudget, reconciledAt);
  if (repository.budgetReconciliations.some(({ id }) => id === record.id)) {
    throw new Error('Budget reconciliation version conflict.');
  }
  repository.budgetReconciliations.push(record);
  repository.budgets.set(updatedBudget.id, updatedBudget);
  repository.feedChanges.push({
    audience: financeAudience(scopeFor(updatedBudget)),
    entityType: 'financeReconciliation',
    entityId: record.id,
    version: 1,
    changedAt: reconciledAt,
    operation: 'upsert',
    payload: record,
  });
  recordBudgetFeed(repository, updatedBudget);
  return repository.remember(actor.id, mutationId, record);
}

export function markFinanceBudgetChanged(repository: FinanceMemoryRepository, budgetId: string) {
  const budget = repository.budgets.get(budgetId);
  if (!budget) return;
  const changed = markBudgetChangedSinceReconciliation(budget);
  if (changed === budget) return;
  repository.budgets.set(changed.id, changed);
  recordBudgetFeed(repository, changed);
}

export function markFinanceBudgetsChangedByTransaction(
  repository: FinanceMemoryRepository,
  transaction: FinancialTransaction,
) {
  const budgetIds = new Set(
    transaction.allocations.flatMap(({ budgetItemId }) => {
      const item = budgetItemId ? repository.budgetItems.get(budgetItemId) : undefined;
      return item ? [item.budgetId] : [];
    }),
  );
  for (const budgetId of budgetIds) markFinanceBudgetChanged(repository, budgetId);
}
