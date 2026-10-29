import {
  canReadTaskAs,
  canRevealFinancialTaskLink,
  contentAudienceFor,
  createFinancialTaskLink,
  createTask,
  financeAudience,
  removeFinancialTaskLink,
  type FinancialTaskLink,
  type Task,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';

export interface CreateFinanceTaskResult {
  taskId: string;
  financialTaskLinkId: string;
  task: Task;
  link: FinancialTaskLink;
}

export function createTaskFromFinanceBudgetItem(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetItemId: string,
  input: {
    taskId: string;
    linkId: string;
    label: string;
    assigneeId: string;
    dueDate?: string;
  },
  mutationId: string,
  now = new Date(),
): CreateFinanceTaskResult {
  const replay = repository.mutation<CreateFinanceTaskResult>(actor, mutationId);
  if (replay) return replay;
  const item = repository.budgetItems.get(budgetItemId);
  const budget = item ? repository.budgets.get(item.budgetId) : undefined;
  const scope = budget ? { type: 'group' as const, groupId: budget.groupId } : undefined;
  if (
    !item ||
    item.status !== 'active' ||
    !budget ||
    !scope ||
    !authorizeFinanceScope(actor, scope, 'edit').allowed ||
    !item.relatedAccountIds.every((id) => {
      const account = repository.accounts.get(id);
      return account && authorizeFinanceScope(actor, account.scope, 'read').allowed;
    })
  ) {
    throw new Error('Finance record not found.');
  }
  if (repository.tasks.has(input.taskId) || repository.financialTaskLinks.has(input.linkId)) {
    throw new Error('Financial task version conflict.');
  }
  const task = createTask(
    {
      label: input.label,
      assigneeId: input.assigneeId,
      visibility: 'public',
      ...(input.dueDate ? { dueKind: 'date' as const, dueDate: input.dueDate } : {}),
    },
    actor.id,
    now,
  );
  const persistedTask = { ...task, id: input.taskId };
  const link = createFinancialTaskLink({
    id: input.linkId,
    budgetId: budget.id,
    budgetItemId: item.id,
    taskId: persistedTask.id,
    groupId: budget.groupId,
    createdBy: actor.id,
    now,
  });
  const result = {
    taskId: persistedTask.id,
    financialTaskLinkId: link.id,
    task: persistedTask,
    link,
  };

  // Both maps are updated only after every invariant and authorization check succeeds.
  repository.tasks.set(persistedTask.id, persistedTask);
  repository.financialTaskLinks.set(link.id, link);
  repository.feedChanges.push({
    audience: contentAudienceFor({ ownerId: persistedTask.ownerId, locked: false }).ordinary,
    entityType: 'task',
    entityId: persistedTask.id,
    version: persistedTask.version,
    changedAt: persistedTask.updatedAt,
    operation: 'upsert',
    payload: persistedTask,
  });
  repository.feedChanges.push({
    audience: financeAudience(scope),
    entityType: 'financeTaskLink',
    entityId: link.id,
    version: link.version,
    changedAt: link.updatedAt,
    operation: 'upsert',
    payload: link,
  });
  return repository.remember(actor.id, mutationId, result);
}

export function authorizedFinancialTaskLinkForTask(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  taskId: string,
): FinancialTaskLink | undefined {
  const task = repository.tasks.get(taskId);
  const link = [...repository.financialTaskLinks.values()].find(
    (candidate) => candidate.taskId === taskId && candidate.status === 'active',
  );
  const budget = link ? repository.budgets.get(link.budgetId) : undefined;
  if (!task || !link || !budget) return undefined;
  const canReadTask = canReadTaskAs(task, {
    id: actor.id,
    role: actor.role,
    active: actor.active,
    groupIds: actor.groupMemberships.map(({ groupId }) => groupId),
  }).allowed;
  const item = repository.budgetItems.get(link.budgetItemId);
  if (
    !item ||
    !item.relatedAccountIds.every((id) => {
      const account = repository.accounts.get(id);
      return account && authorizeFinanceScope(actor, account.scope, 'read').allowed;
    })
  )
    return undefined;
  const canReadFinance = authorizeFinanceScope(
    actor,
    { type: 'group', groupId: budget.groupId },
    'read',
  ).allowed;
  return canRevealFinancialTaskLink({ link, canReadTask, canReadFinance }) ? link : undefined;
}

export function removeAuthorizedFinancialTaskLink(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  linkId: string,
  expectedVersion: number,
  now = new Date(),
) {
  const link = repository.financialTaskLinks.get(linkId);
  const budget = link ? repository.budgets.get(link.budgetId) : undefined;
  if (
    !link ||
    !budget ||
    !authorizeFinanceScope(actor, { type: 'group', groupId: budget.groupId }, 'delete').allowed
  ) {
    throw new Error('Finance record not found.');
  }
  if (link.version !== expectedVersion) throw new Error('Financial task link version conflict.');
  const removed = removeFinancialTaskLink(link, now);
  repository.financialTaskLinks.set(removed.id, removed);
  repository.feedChanges.push({
    audience: removed.financeAudience,
    entityType: 'financeTaskLink',
    entityId: removed.id,
    version: removed.version,
    changedAt: removed.updatedAt,
    operation: 'tombstone',
  });
  return removed;
}
