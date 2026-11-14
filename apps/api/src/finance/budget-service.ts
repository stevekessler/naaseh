import {
  calculateBudgetTotals,
  closeBudget,
  createBudget,
  createBudgetAccountLink,
  createBudgetItem,
  createFinanceClassificationSnapshot,
  deactivateBudget,
  effectiveBudgetActivity,
  financeAudience,
  markBudgetChangedSinceReconciliation,
  reactivateBudget,
  reopenBudget,
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
  if (!authorizeFinanceScope(actor, { type: 'group', groupId: input.groupId }, 'edit').allowed) {
    throw new Error('Finance record not found.');
  }
  const replay = repository.mutation<Budget>(actor.id, mutationId);
  if (replay) {
    const current = authorizedBudget(repository, actor, replay.id, 'edit');
    if (current.groupId !== input.groupId || replay.groupId !== current.groupId)
      throw new Error('Budget version conflict.');
    return replay;
  }
  if (repository.budgets.has(input.id)) throw new Error('Budget already exists.');
  const timestamp = new Date().toISOString();
  const budget = createBudget({
    ...input,
    status: input.status ?? 'active',
    activityChangedAt: timestamp,
    activityChangedBy: actor.id,
  });
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
  const current = authorizedBudget(
    repository,
    actor,
    budgetId,
    input.status === 'archived' ? 'delete' : 'edit',
  );
  const replay = repository.mutation<Budget>(actor.id, mutationId);
  if (replay) {
    if (
      replay.id !== current.id ||
      replay.groupId !== current.groupId ||
      replay.version !== input.expectedVersion + 1
    )
      throw new Error('Budget version conflict.');
    return replay;
  }
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
    ...(input.status === 'active' && effectiveBudgetActivity(current) === 'inactive'
      ? {
          activity: 'active' as const,
          activityChangedAt: new Date().toISOString(),
          activityChangedBy: actor.id,
        }
      : {}),
    version: current.version + 1,
  };
  repository.budgets.set(updated.id, updated);
  recordBudgetFeed(repository, updated);
  return repository.remember(actor.id, mutationId, updated);
}

type BudgetVersionInput = { expectedVersion: number };

const changeFinanceBudgetState = async (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: BudgetVersionInput,
  mutationId: string,
  change: (budget: Budget) => Budget,
  expected: (budget: Budget) => boolean,
) => {
  const current = authorizedBudget(repository, actor, budgetId, 'edit');
  const replay = repository.mutation<Budget>(actor.id, mutationId);
  if (replay) {
    if (replay.id !== current.id || replay.groupId !== current.groupId || !expected(replay)) {
      throw new Error('Budget version conflict.');
    }
    return replay;
  }
  if (current.version !== input.expectedVersion) throw new Error('Budget version conflict.');
  const updated = change(current);
  if (updated !== current) {
    repository.budgets.set(updated.id, updated);
    recordBudgetFeed(repository, updated);
  }
  return repository.remember(actor.id, mutationId, updated);
};

export const deactivateFinanceBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: BudgetVersionInput,
  mutationId: string,
  now = new Date(),
) =>
  changeFinanceBudgetState(
    repository,
    actor,
    budgetId,
    input,
    mutationId,
    (budget) => deactivateBudget(budget, actor.id, now),
    (budget) => effectiveBudgetActivity(budget) === 'inactive',
  );

export const reactivateFinanceBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: BudgetVersionInput,
  mutationId: string,
  now = new Date(),
) =>
  changeFinanceBudgetState(
    repository,
    actor,
    budgetId,
    input,
    mutationId,
    (budget) => reactivateBudget(budget, actor.id, now),
    (budget) => effectiveBudgetActivity(budget) === 'active',
  );

export const closeFinanceBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: BudgetVersionInput,
  mutationId: string,
  now = new Date(),
) =>
  changeFinanceBudgetState(
    repository,
    actor,
    budgetId,
    input,
    mutationId,
    (budget) => closeBudget(budget, actor.id, now),
    (budget) => Boolean(budget.closedAt),
  );

export const reopenFinanceBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: BudgetVersionInput,
  mutationId: string,
) =>
  changeFinanceBudgetState(
    repository,
    actor,
    budgetId,
    input,
    mutationId,
    reopenBudget,
    (budget) => !budget.closedAt,
  );

export async function linkFinanceBudgetAccount(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  input: { id: string; accountId: string; expectedBudgetVersion: number },
  mutationId: string,
) {
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
  const replay = repository.mutation<ReturnType<typeof createBudgetAccountLink>>(
    actor.id,
    mutationId,
  );
  if (replay) {
    if (
      replay.budgetId !== budget.id ||
      replay.accountId !== account.id ||
      !replay.audience ||
      financeAudience(replay.audience) !== financeAudience(account.scope)
    )
      throw new Error('Budget version conflict.');
    return replay;
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
  const budget = authorizedBudget(repository, actor, budgetId, 'edit');
  const replay = repository.mutation<BudgetItem>(actor.id, mutationId);
  if (
    replay &&
    (replay.budgetId !== budget.id ||
      replay.currency !== input.currency ||
      replay.relatedAccountIds?.length !== input.relatedAccountIds.length ||
      replay.relatedAccountIds.some((id, index) => id !== input.relatedAccountIds[index]))
  )
    throw new Error('Budget version conflict.');
  if (!replay && budget.version !== input.expectedBudgetVersion)
    throw new Error('Budget version conflict.');
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
  if (replay) return replay;
  const category = repository.categories.get(input.financeCategoryId);
  const subcategory = input.subcategoryId
    ? repository.categories.get(input.subcategoryId)
    : undefined;
  if (input.subcategoryId && (!category || !subcategory))
    throw new Error('Finance record not found.');
  const classification = category
    ? createFinanceClassificationSnapshot(category, subcategory)
    : undefined;
  const item = createBudgetItem({
    id: input.id,
    budgetId,
    description: input.description,
    financeCategoryId: input.financeCategoryId,
    ...(input.subcategoryId ? { subcategoryId: input.subcategoryId } : {}),
    ...(classification ? { classification } : {}),
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
  repository.feedChanges.push({
    audience: financeAudience(budgetScope(budget)),
    entityType: 'financeBudgetItem',
    entityId: item.id,
    version: item.version,
    changedAt: new Date().toISOString(),
    operation: 'upsert',
    payload: item,
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
  const allItems = [...repository.budgetItems.values()].filter(
    (item) => item.budgetId === budget.id && item.status === 'active',
  );
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
    items: allItems,
    links: allLinks,
    visibleAccountIds: visibleIds,
    transactions: repository.transactions,
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
      .flatMap(({ allocations }) => allocations)
      .filter((allocation) => allocation.budgetItemId === item.id)
      .reduce((sum, allocation) => sum + allocation.amountMinor, 0);
    return {
      ...item,
      relatedAccountIds: item.relatedAccountIds.filter((id) => visible.has(id)),
      actualAmountMinor: actualMinor,
      varianceMinor: actualMinor - item.plannedAmountMinor,
    };
  });
  return {
    ...budget,
    activity: effectiveBudgetActivity(budget),
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
