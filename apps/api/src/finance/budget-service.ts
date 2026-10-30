import { itemsForBudget, itemBudgetIds, allocationBudgetId } from './budget-membership.js';
import {
  calculateBudgetTotals,
  createBudget,
  createBudgetAccountLink,
  createBudgetItem,
  financeAudience,
  markBudgetChangedSinceReconciliation,
  type Budget,
  type BudgetItem,
  type CreateBudgetInput,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';
import {
  financeBudgetReconciliationReadiness,
  listBudgetReconciliationHistory,
} from './reconciliation-service.js';

const budgetScope = (budget: Budget) => ({ type: 'group' as const, groupId: budget.groupId });

const authorizedBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  action: 'read' | 'edit' | 'delete' = 'read',
) => {
  const budget = repository.budgets.get(budgetId);
  if (
    !budget ||
    budget.status === 'tombstone' ||
    !authorizeFinanceScope(actor, budgetScope(budget), action).allowed
  ) {
    throw new Error('Finance record not found.');
  }
  return budget;
};

const recordBudgetFeed = (repository: FinanceMemoryRepository, budget: Budget) => {
  repository.feedChanges.push({
    audience: financeAudience(budgetScope(budget)),
    entityType: 'financeBudget',
    entityId: budget.id,
    version: budget.version,
    changedAt: new Date().toISOString(),
    operation: budget.status === 'tombstone' ? 'tombstone' : 'upsert',
    payload: budget,
  });
};

const bumpBudget = (repository: FinanceMemoryRepository, budget: Budget) => {
  const changed = markBudgetChangedSinceReconciliation(budget);
  const updated = changed === budget ? { ...budget, version: budget.version + 1 } : changed;
  repository.budgets.set(updated.id, updated);
  recordBudgetFeed(repository, updated);
  return updated;
};

export async function createFinanceBudget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: CreateBudgetInput,
  mutationId: string,
) {
  const replay = repository.mutation<Budget>(actor, mutationId);
  if (replay) return replay;
  if (!authorizeFinanceScope(actor, { type: 'group', groupId: input.groupId }, 'edit').allowed) {
    throw new Error('Finance record not found.');
  }
  if (repository.budgets.has(input.id)) throw new Error('Budget already exists.');
  const budget = createBudget(input);
  repository.budgets.set(budget.id, budget);
  recordBudgetFeed(repository, budget);
  return repository.remember(actor.id, mutationId, budget);
}

export async function updateFinanceBudget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: {
    expectedVersion: number;
    name?: string;
    budgetDate?: string;
    startDate?: string;
    endDate?: string | null;
    status?: 'draft' | 'active' | 'archived';
  },
  mutationId: string,
) {
  const replay = repository.mutation<Budget>(actor, mutationId);
  if (replay) return replay;
  const current = authorizedBudget(
    repository,
    actor,
    budgetId,
    input.status === 'archived' ? 'delete' : 'edit',
  );
  if (current.version !== input.expectedVersion) throw new Error('Budget version conflict.');
  const validated = createBudget({
    id: current.id,
    groupId: current.groupId,
    name: input.name ?? current.name,
    budgetDate: input.budgetDate ?? current.budgetDate,
    startDate: input.startDate ?? current.startDate,
    endDate: input.endDate === undefined ? current.endDate : input.endDate,
    status: input.status === 'active' ? 'active' : 'draft',
  });
  const updated: Budget = {
    ...current,
    name: validated.name,
    budgetDate: validated.budgetDate,
    startDate: validated.startDate,
    endDate: validated.endDate,
    status:
      input.status ??
      ((input.budgetDate !== undefined ||
        input.startDate !== undefined ||
        input.endDate !== undefined) &&
      current.lastReconciledAt &&
      current.status === 'active'
        ? 'changed-since-reconciliation'
        : current.status),
    version: current.version + 1,
  };
  repository.budgets.set(updated.id, updated);
  recordBudgetFeed(repository, updated);
  return repository.remember(actor.id, mutationId, updated);
}

export async function linkFinanceBudgetAccount(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: { id: string; accountId: string; expectedBudgetVersion: number },
  mutationId: string,
) {
  const replay = repository.mutation<ReturnType<typeof createBudgetAccountLink>>(actor, mutationId);
  if (replay) return replay;
  const budget = authorizedBudget(repository, actor, budgetId, 'edit');
  const account = repository.accounts.get(input.accountId);
  if (
    !account ||
    account.status !== 'active' ||
    !authorizeFinanceScope(actor, account.scope, 'read').allowed ||
    (account.scope.type === 'group' && account.scope.groupId !== budget.groupId)
  ) {
    throw new Error('Finance record not found.');
  }
  if (budget.version !== input.expectedBudgetVersion) throw new Error('Budget version conflict.');
  if (
    [...repository.budgetAccountLinks.values()].some(
      (link) =>
        link.budgetId === budget.id && link.accountId === account.id && link.status === 'active',
    )
  ) {
    throw new Error('Budget account is already linked.');
  }
  if (repository.budgetAccountLinks.has(input.id))
    throw new Error('Budget account link already exists.');
  const link = createBudgetAccountLink({
    id: input.id,
    budgetId,
    accountId: account.id,
    audience: account.scope,
    createdBy: actor.id,
  });
  repository.budgetAccountLinks.set(link.id, link);
  bumpBudget(repository, budget);
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeBudgetAccountLink',
    entityId: link.id,
    version: link.version,
    changedAt: new Date().toISOString(),
    operation: 'upsert',
    payload: link,
  });
  return repository.remember(actor.id, mutationId, link);
}

export async function addFinanceBudgetItem(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: Omit<Parameters<typeof createBudgetItem>[0], 'budgetId' | 'creatorId'> & {
    expectedBudgetVersion: number;
  },
  mutationId: string,
) {
  const replay = repository.mutation<BudgetItem>(actor, mutationId);
  if (replay) return replay;
  const budget = authorizedBudget(repository, actor, budgetId, 'edit');
  if (budget.version !== input.expectedBudgetVersion) throw new Error('Budget version conflict.');
  const activeLinks = [...repository.budgetAccountLinks.values()].filter(
    (link) => link.budgetId === budget.id && link.status === 'active',
  );
  for (const accountId of input.relatedAccountIds) {
    const account = repository.accounts.get(accountId);
    if (
      !account ||
      account.currency !== input.currency ||
      !activeLinks.some((link) => link.accountId === accountId) ||
      !authorizeFinanceScope(actor, account.scope, 'read').allowed
    ) {
      throw new Error('Finance record not found.');
    }
  }
  if (repository.budgetItems.has(input.id)) throw new Error('Budget item already exists.');
  const item = createBudgetItem({
    id: input.id,
    budgetId,
    description: input.description,
    financeCategoryId: input.financeCategoryId,
    plannedAmountMinor: input.plannedAmountMinor,
    currency: input.currency,
    relatedAccountIds: input.relatedAccountIds,
    creatorId: actor.id,
    ...(input.currencyExponent === undefined ? {} : { currencyExponent: input.currencyExponent }),
    ...(input.sourceReusableItemId ? { sourceReusableItemId: input.sourceReusableItemId } : {}),
    ...(input.merchantId ? { merchantId: input.merchantId } : {}),
    ...(input.applicableDate ? { applicableDate: input.applicableDate } : {}),
  });
  repository.budgetItems.set(item.id, item);
  bumpBudget(repository, budget);
  const groupVisible = item.relatedAccountIds.every((id) => {
    const scope = repository.accounts.get(id)?.scope;
    return scope?.type === 'group' && scope.groupId === budget.groupId;
  });
  repository.feedChanges.push({
    audience: financeAudience(budgetScope(budget)),
    entityType: 'financeBudgetItem',
    entityId: item.id,
    version: item.version,
    changedAt: new Date().toISOString(),
    // Purge older group projections; private items use authorized direct reads.
    operation: groupVisible ? 'upsert' : 'tombstone',
    ...(groupVisible ? { payload: item } : {}),
  });
  return repository.remember(actor.id, mutationId, item);
}

const visibleAccountIds = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
) =>
  [...repository.budgetAccountLinks.values()]
    .filter((link) => link.budgetId === budgetId && link.status === 'active')
    .filter((link) => {
      const account = repository.accounts.get(link.accountId);
      return account && authorizeFinanceScope(actor, account.scope, 'read').allowed;
    })
    .map(({ accountId }) => accountId);

export function getFinanceBudget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
) {
  const budget = authorizedBudget(repository, actor, budgetId);
  const allLinks = [...repository.budgetAccountLinks.values()].filter(
    (link) => link.budgetId === budget.id && link.status === 'active',
  );
  const allItems = itemsForBudget(repository, budget.id).filter((item) => item.status === 'active');
  const visibleIds = visibleAccountIds(repository, actor, budget.id);
  const visible = new Set(visibleIds);
  const accountLinks = allLinks.filter((link) => visible.has(link.accountId));
  const items = allItems.filter((item) =>
    item.relatedAccountIds.every((accountId) => visible.has(accountId)),
  );
  const confirmedTransferIds = [...repository.transfers.values()]
    .filter(({ status }) => status === 'confirmed')
    .map(({ id }) => id);
  const totals = calculateBudgetTotals({
    budgetId: budget.id,
    items: allItems,
    links: allLinks,
    visibleAccountIds: visibleIds,
    transactions: repository.transactions.filter((transaction) =>
      transaction.allocations.some(
        (allocation) => allocationBudgetId(repository, allocation) === budget.id,
      ),
    ),
    confirmedTransferIds,
  });
  const confirmed = new Set(confirmedTransferIds);
  const itemViews = items.map((item) => {
    const actualMinor = repository.transactions
      .filter(
        (transaction) =>
          visible.has(transaction.accountId) &&
          transaction.status === 'active' &&
          (!transaction.transferId || !confirmed.has(transaction.transferId)),
      )
      .flatMap(({ allocations }) =>
        allocations.filter(
          (allocation) => allocationBudgetId(repository, allocation) === budget.id,
        ),
      )
      .filter((allocation) => allocation.budgetItemId === item.id)
      .reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    return {
      ...item,
      actualAmountMinor: actualMinor,
      varianceMinor: actualMinor - item.plannedAmountMinor,
    };
  });
  return {
    ...budget,
    accountLinks,
    items: itemViews,
    totals: totals.byCurrency,
    categoryTotals: totals.byCategory,
    totalsComplete: totals.totalsComplete,
    reconciliationReadiness:
      budget.status === 'active' || budget.status === 'changed-since-reconciliation'
        ? financeBudgetReconciliationReadiness(repository, actor, budget.id)
        : { canReconcile: false, reasons: ['Only an active budget can be reconciled.'] },
    reconciliations: listBudgetReconciliationHistory(repository, actor, budget.id),
  };
}

export function listFinanceBudgets(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  groupId?: string,
) {
  const items = [...repository.budgets.values()]
    .filter((budget) => budget.status !== 'tombstone' && (!groupId || budget.groupId === groupId))
    .filter((budget) => authorizeFinanceScope(actor, budgetScope(budget), 'read').allowed)
    .sort(
      (left, right) =>
        right.budgetDate.localeCompare(left.budgetDate) || right.id.localeCompare(left.id),
    )
    .map((budget) => getFinanceBudget(repository, actor, budget.id));
  return { items, cursor: null };
}

export async function linkSharedFinanceBudgetItem(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  itemId: string,
  expectedBudgetVersion: number,
  mutationId: string,
) {
  const replay = repository.mutation<BudgetItem>(actor, mutationId);
  if (replay) return replay;
  const budget = authorizedBudget(repository, actor, budgetId, 'edit');
  const item = repository.budgetItems.get(itemId);
  if (!item || item.status !== 'active') throw new Error('Finance record not found.');
  if (
    !itemBudgetIds(repository, item).some((id) => {
      const source = repository.budgets.get(id);
      return (
        source &&
        source.status !== 'tombstone' &&
        authorizeFinanceScope(actor, budgetScope(source), 'read').allowed
      );
    })
  )
    throw new Error('Finance record not found.');
  if (budget.version !== expectedBudgetVersion) throw new Error('Budget version conflict.');
  const links = [...repository.budgetAccountLinks.values()].filter(
    (link) => link.budgetId === budgetId && link.status === 'active',
  );
  for (const accountId of item.relatedAccountIds) {
    const account = repository.accounts.get(accountId);
    if (
      !account ||
      !authorizeFinanceScope(actor, account.scope, 'read').allowed ||
      !links.some((link) => link.accountId === accountId)
    )
      throw new Error('Finance record not found.');
  }
  if (!itemBudgetIds(repository, item).includes(budgetId)) {
    repository.budgetItemMemberships.set(`${budgetId}:${itemId}`, {
      budgetId,
      budgetItemId: itemId,
    });
    bumpBudget(repository, budget);
  }
  return repository.remember(actor.id, mutationId, { ...item, budgetId });
}

export async function updateSharedFinanceBudgetItem(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  itemId: string,
  input: { expectedVersion: number; description: string; plannedAmountMinor: number },
  mutationId: string,
) {
  const replay = repository.mutation<BudgetItem>(actor, mutationId);
  if (replay) return replay;
  const item = repository.budgetItems.get(itemId);
  if (!item || item.status !== 'active') throw new Error('Finance record not found.');
  const budgets = itemBudgetIds(repository, item).map((id) =>
    authorizedBudget(repository, actor, id, 'edit'),
  );
  for (const accountId of item.relatedAccountIds) {
    const account = repository.accounts.get(accountId);
    if (!account || !authorizeFinanceScope(actor, account.scope, 'read').allowed)
      throw new Error('Finance record not found.');
  }
  if (item.version !== input.expectedVersion) throw new Error('Budget item version conflict.');
  const validated = createBudgetItem({
    ...item,
    description: input.description,
    plannedAmountMinor: input.plannedAmountMinor,
  });
  const updated = {
    ...item,
    description: validated.description,
    plannedAmountMinor: validated.plannedAmountMinor,
    version: item.version + 1,
  };
  repository.budgetItems.set(itemId, updated);
  for (const budget of budgets) bumpBudget(repository, budget);
  return repository.remember(actor.id, mutationId, updated);
}
