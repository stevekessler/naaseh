import {
  adaptLegacyFinancialTaskLink,
  canReadTaskAs,
  canRevealFinancialTaskLink,
  contentAudienceFor,
  createFinancialTaskLink,
  createTask,
  financialTaskLinkPairKey,
  removeFinancialTaskLink,
  type FinancialTaskLink,
  type FinancialTaskTarget,
  type Task,
  type TaskInput,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceAction, type FinanceActor } from './authorization.js';
import { FinanceMemoryRepository } from './repository.js';

export interface CreateFinanceTaskResult {
  taskId: string;
  financialTaskLinkId: string;
  task: Task;
  link: FinancialTaskLink;
}

export interface CreateTaskWithFinanceLinksResult {
  taskId: string;
  linkStatus: 'applied';
  financialTaskLinkIds: string[];
  task: Task;
  links: FinancialTaskLink[];
}

const taskActor = (actor: FinanceActor) => ({
  id: actor.id,
  role: 'user' as const,
  active: actor.active,
  groupIds: actor.groupMemberships.map(({ groupId }) => groupId),
});

function targetAccess(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  target: FinancialTaskTarget,
  action: FinanceAction,
): { target: FinancialTaskTarget; audience: `OWNER#${string}` | `GROUP#${string}` } | undefined {
  if (target.targetType === 'budgetItem') {
    const item = repository.budgetItems.get(target.targetId);
    const budget = item ? repository.budgets.get(item.budgetId) : undefined;
    if (!item || item.status !== 'active' || !budget || budget.id !== target.budgetId) return undefined;
    const decision = authorizeFinanceScope(actor, { type: 'group', groupId: budget.groupId }, action);
    return decision.allowed && decision.audience
      ? { target: { ...target, budgetId: budget.id }, audience: decision.audience }
      : undefined;
  }
  if (target.targetType === 'transaction') {
    const transaction = repository.transactions.find(
      (candidate) => candidate.id === target.targetId && candidate.status === 'active',
    );
    const account = transaction ? repository.accounts.get(transaction.accountId) : undefined;
    const decision = account ? authorizeFinanceScope(actor, account.scope, action) : undefined;
    return transaction && decision?.allowed && decision.audience
      ? { target, audience: decision.audience }
      : undefined;
  }
  const expense = repository.upcomingExpenses.get(target.targetId);
  const account = expense ? repository.accounts.get(expense.accountId) : undefined;
  const budget = expense ? repository.budgets.get(expense.budgetId) : undefined;
  const membership = expense
    ? actor.groupMemberships.find(({ groupId }) => groupId === expense.groupId)
    : undefined;
  const decision = account ? authorizeFinanceScope(actor, account.scope, action) : undefined;
  return expense &&
    expense.lifecycle === 'active' &&
    budget?.groupId === expense.groupId &&
    membership &&
    (account?.scope.type !== 'group' || account.scope.groupId === expense.groupId) &&
    decision?.allowed &&
    decision.audience
    ? { target, audience: decision.audience }
    : undefined;
}

function normalizedLinks(repository: FinanceMemoryRepository) {
  return [...repository.financialTaskLinks.values()].map(adaptLegacyFinancialTaskLink);
}

function rememberLink(repository: FinanceMemoryRepository, link: FinancialTaskLink) {
  const pair = financialTaskLinkPairKey(link.taskId, link.targetType, link.targetId);
  const existingId = repository.financialTaskLinkPairs.get(pair);
  const existing = existingId ? repository.financialTaskLinks.get(existingId) : undefined;
  if (existing?.status === 'active') throw new Error('Financial task target is already linked.');
  repository.financialTaskLinks.set(link.id, link);
  repository.financialTaskLinkPairs.set(pair, link.id);
  repository.feedChanges.push({
    audience: link.financeAudience,
    entityType: 'financeTaskLink',
    entityId: link.id,
    version: link.version,
    changedAt: link.updatedAt,
    operation: 'upsert',
    payload: link,
  });
}

/** Creates an ordinary task and all selected protected relationships as one in-memory commit. */
export function createTaskWithFinanceLinks(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: {
    taskId: string;
    linkIds: readonly string[];
    task: TaskInput;
    selections: readonly FinancialTaskTarget[];
  },
  mutationId: string,
  now = new Date(),
): CreateTaskWithFinanceLinksResult {
  const replay = repository.mutation<CreateTaskWithFinanceLinksResult>(actor.id, mutationId);
  if (replay) {
    if (!repository.tasks.has(replay.taskId) ||
      replay.links.some(({ id }) => !repository.financialTaskLinks.has(id)))
      throw new Error('Finance record not found.');
    return replay;
  }
  if (
    !input.selections.length || input.selections.length > 50 ||
    input.linkIds.length !== input.selections.length ||
    new Set(input.linkIds).size !== input.linkIds.length ||
    repository.tasks.has(input.taskId)
  ) throw new Error('Invalid Finance task relationship selection.');
  const pairKeys = input.selections.map(({ targetType, targetId }) =>
    financialTaskLinkPairKey(input.taskId, targetType, targetId));
  if (new Set(pairKeys).size !== pairKeys.length) throw new Error('Finance link selections must be unique.');
  const access = input.selections.map((target) => targetAccess(repository, actor, target, 'edit'));
  if (access.some((value) => !value) || input.linkIds.some((id) => repository.financialTaskLinks.has(id)))
    throw new Error('Finance record not found.');
  const task = { ...createTask(input.task, actor.id, now), id: input.taskId };
  const links = access.map((value, index) => createFinancialTaskLink({
    id: input.linkIds[index]!, taskId: task.id, target: value!.target,
    financeAudience: value!.audience, createdBy: actor.id, now,
  }));
  repository.tasks.set(task.id, task);
  for (const link of links) rememberLink(repository, link);
  repository.feedChanges.push({
    audience: contentAudienceFor({ ownerId: task.ownerId, locked: task.visibility === 'private' }).ordinary,
    entityType: 'task', entityId: task.id, version: task.version, changedAt: task.updatedAt,
    operation: 'upsert', payload: task,
  });
  return repository.remember(actor.id, mutationId, {
    taskId: task.id, linkStatus: 'applied', financialTaskLinkIds: links.map(({ id }) => id), task, links,
  });
}

export function createTaskFromFinanceTarget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  target: FinancialTaskTarget,
  input: { taskId: string; linkId: string; label: string; assigneeId: string; dueDate?: string },
  mutationId: string,
  now = new Date(),
): CreateFinanceTaskResult {
  const replay = repository.mutation<CreateFinanceTaskResult>(actor.id, mutationId);
  if (replay) {
    const current = authorizedFinancialTaskLinksForTask(repository, actor, replay.taskId).find(
      ({ id }) => id === replay.financialTaskLinkId,
    );
    if (!current) throw new Error('Finance record not found.');
    return replay;
  }
  const access = targetAccess(repository, actor, target, 'edit');
  if (!access) throw new Error('Finance record not found.');
  if (repository.tasks.has(input.taskId) || repository.financialTaskLinks.has(input.linkId))
    throw new Error('Financial task version conflict.');
  const task = createTask({
    label: input.label,
    assigneeId: input.assigneeId,
    visibility: 'public',
    ...(input.dueDate ? { dueKind: 'date' as const, dueDate: input.dueDate } : {}),
  }, actor.id, now);
  const persistedTask = { ...task, id: input.taskId };
  const link = createFinancialTaskLink({
    id: input.linkId,
    taskId: persistedTask.id,
    target: access.target,
    financeAudience: access.audience,
    createdBy: actor.id,
    now,
  });
  const result = { taskId: persistedTask.id, financialTaskLinkId: link.id, task: persistedTask, link };
  repository.tasks.set(persistedTask.id, persistedTask);
  rememberLink(repository, link);
  repository.feedChanges.push({
    audience: contentAudienceFor({ ownerId: persistedTask.ownerId, locked: false }).ordinary,
    entityType: 'task', entityId: persistedTask.id, version: persistedTask.version,
    changedAt: persistedTask.updatedAt, operation: 'upsert', payload: persistedTask,
  });
  return repository.remember(actor.id, mutationId, result);
}

export function createAuthorizedFinancialTaskLink(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  taskId: string,
  target: FinancialTaskTarget,
  linkId: string,
  expectedTaskVersion: number,
  now = new Date(),
) {
  const task = repository.tasks.get(taskId);
  const access = targetAccess(repository, actor, target, 'edit');
  if (
    !task || task.ownerId !== actor.id || task.version !== expectedTaskVersion ||
    !canReadTaskAs(task, taskActor(actor)).allowed || !access
  ) throw new Error('Finance record not found.');
  if (repository.financialTaskLinks.has(linkId)) throw new Error('Financial task link version conflict.');
  const pair = financialTaskLinkPairKey(taskId, target.targetType, target.targetId);
  const duplicate = repository.financialTaskLinkPairs.get(pair) ?? normalizedLinks(repository).find(
    (link) => link.status === 'active' && link.taskId === taskId &&
      link.targetType === target.targetType && link.targetId === target.targetId,
  )?.id;
  if (duplicate) throw new Error('Financial task target is already linked.');
  const link = createFinancialTaskLink({
    id: linkId,
    taskId,
    target: access.target,
    financeAudience: access.audience,
    createdBy: actor.id,
    now,
  });
  rememberLink(repository, link);
  return link;
}

export function createTaskFromFinanceBudgetItem(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetItemId: string,
  input: { taskId: string; linkId: string; label: string; assigneeId: string; dueDate?: string },
  mutationId: string,
  now = new Date(),
): CreateFinanceTaskResult {
  const item = repository.budgetItems.get(budgetItemId);
  const budget = item ? repository.budgets.get(item.budgetId) : undefined;
  if (!item || !budget) throw new Error('Finance record not found.');
  return createTaskFromFinanceTarget(repository, actor, {
    targetType: 'budgetItem', targetId: budgetItemId, budgetId: budget.id,
  }, input, mutationId, now);
}

export function authorizedFinancialTaskLinksForTask(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  taskId: string,
): FinancialTaskLink[] {
  const task = repository.tasks.get(taskId);
  if (!task || !canReadTaskAs(task, taskActor(actor)).allowed) return [];
  return normalizedLinks(repository).filter((link) => {
    if (link.taskId !== taskId || link.status !== 'active') return false;
    const finance = targetAccess(repository, actor, {
      targetType: link.targetType,
      targetId: link.targetId,
      ...(link.targetType === 'budgetItem' ? { budgetId: link.budgetId! } : {}),
    } as FinancialTaskTarget, 'read');
    return canRevealFinancialTaskLink({ link, canReadTask: true, canReadFinance: Boolean(finance) });
  });
}

export function authorizedFinancialTaskLinksForTasks(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  taskIds: readonly string[],
) {
  if (!taskIds.length || taskIds.length > 50 || new Set(taskIds).size !== taskIds.length)
    throw new Error('Finance task batch must contain 1 to 50 unique task ids.');
  const result = new Map<string, FinancialTaskLink[]>();
  for (const taskId of taskIds) result.set(taskId, authorizedFinancialTaskLinksForTask(repository, actor, taskId));
  return result;
}

export function authorizedTasksForFinancialTarget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  target: FinancialTaskTarget,
) {
  if (!targetAccess(repository, actor, target, 'read')) return [];
  return normalizedLinks(repository)
    .filter((link) => link.status === 'active' && link.targetType === target.targetType && link.targetId === target.targetId)
    .flatMap((link) => {
      const task = repository.tasks.get(link.taskId);
      return task && canReadTaskAs(task, taskActor(actor)).allowed ? [task] : [];
    });
}

export function authorizedFinancialTaskLinkForTask(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  taskId: string,
) {
  return authorizedFinancialTaskLinksForTask(repository, actor, taskId)[0];
}

export function removeAuthorizedFinancialTaskLink(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  linkId: string,
  expectedVersion: number,
  now = new Date(),
) {
  const stored = repository.financialTaskLinks.get(linkId);
  const link = stored ? adaptLegacyFinancialTaskLink(stored) : undefined;
  const task = link ? repository.tasks.get(link.taskId) : undefined;
  const access = link ? targetAccess(repository, actor, {
    targetType: link.targetType,
    targetId: link.targetId,
    ...(link.targetType === 'budgetItem' ? { budgetId: link.budgetId! } : {}),
  } as FinancialTaskTarget, 'edit') : undefined;
  if (!link || !task || task.ownerId !== actor.id || !access) throw new Error('Finance record not found.');
  if (link.version !== expectedVersion) throw new Error('Financial task link version conflict.');
  const removed = removeFinancialTaskLink(link, now);
  repository.financialTaskLinks.set(removed.id, removed);
  repository.financialTaskLinkPairs.delete(financialTaskLinkPairKey(link.taskId, link.targetType, link.targetId));
  repository.feedChanges.push({
    audience: removed.financeAudience, entityType: 'financeTaskLink', entityId: removed.id,
    version: removed.version, changedAt: removed.updatedAt, operation: 'tombstone',
  });
  return removed;
}

/** Replaces only the links the actor can currently edit; hidden relationships remain untouched. */
export function replaceAuthorizedFinancialTaskLinks(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: {
    taskId: string;
    expectedTaskVersion: number;
    selections: readonly FinancialTaskTarget[];
    linkIds: readonly string[];
  },
  mutationId: string,
  now = new Date(),
) {
  const replay = repository.mutation<{
    links: FinancialTaskLink[];
    removedLinkIds: string[];
  }>(actor.id, mutationId);
  if (replay) {
    const visible = authorizedFinancialTaskLinksForTask(repository, actor, input.taskId);
    if (replay.links.some(({ id }) => !visible.some((link) => link.id === id)))
      throw new Error('Finance record not found.');
    return replay;
  }
  const task = repository.tasks.get(input.taskId);
  if (
    !task ||
    task.ownerId !== actor.id ||
    task.version !== input.expectedTaskVersion ||
    input.selections.length > 50 ||
    input.linkIds.length !== input.selections.length ||
    new Set(input.linkIds).size !== input.linkIds.length
  )
    throw new Error('Finance record not found.');
  const requestedPairs = input.selections.map(({ targetType, targetId }) =>
    financialTaskLinkPairKey(input.taskId, targetType, targetId),
  );
  if (new Set(requestedPairs).size !== requestedPairs.length)
    throw new Error('Finance link selections must be unique.');
  const access = input.selections.map((target) => targetAccess(repository, actor, target, 'edit'));
  if (access.some((value) => !value)) throw new Error('Finance record not found.');
  const editableCurrent = normalizedLinks(repository).filter((link) => {
    if (link.taskId !== input.taskId || link.status !== 'active') return false;
    return Boolean(
      targetAccess(
        repository,
        actor,
        {
          targetType: link.targetType,
          targetId: link.targetId,
          ...(link.targetType === 'budgetItem' ? { budgetId: link.budgetId! } : {}),
        } as FinancialTaskTarget,
        'edit',
      ),
    );
  });
  const requested = new Set(requestedPairs);
  const currentByPair = new Map(
    editableCurrent.map((link) => [
      financialTaskLinkPairKey(link.taskId, link.targetType, link.targetId),
      link,
    ]),
  );
  const removedLinkIds: string[] = [];
  for (const link of editableCurrent)
    if (!requested.has(financialTaskLinkPairKey(link.taskId, link.targetType, link.targetId))) {
      removeAuthorizedFinancialTaskLink(repository, actor, link.id, link.version, now);
      removedLinkIds.push(link.id);
    }
  const links = access.map((authorized, index) => {
    const pair = requestedPairs[index]!;
    const current = currentByPair.get(pair);
    if (current) return current;
    return createAuthorizedFinancialTaskLink(
      repository,
      actor,
      input.taskId,
      authorized!.target,
      input.linkIds[index]!,
      input.expectedTaskVersion,
      now,
    );
  });
  return repository.remember(actor.id, mutationId, { links, removedLinkIds });
}
