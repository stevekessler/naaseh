import {
  cancelUpcomingExpense,
  createExpenseFulfillment,
  createUpcomingExpense,
  createUlid,
  deriveUpcomingExpenseState,
  editUpcomingExpense,
  isBudgetEligibleForNewUpcoming,
  localFinanceDate,
  plannedSourceIdentity,
  removeExpenseFulfillment,
  reopenUpcomingExpense,
  rescheduleUpcomingExpense,
  type UpcomingExpense,
  type UpcomingExpenseEntryContext,
  type UpcomingExpensePlannedSource,
  type ExpenseFulfillment,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import type { FinanceMemoryRepository } from './repository.js';
import { upcomingExpenseRevocationTombstones } from '../sync/sync-service.js';
import {
  fulfillmentsForExpense,
  fulfillmentsForTransaction,
  storeExpenseFulfillment,
} from './upcoming-expense-repository.js';

type CreateInput = {
  id?: string;
  groupId: string;
  accountId: string;
  budgetId: string;
  description: string;
  expectedAmountMinor: number;
  dueDate: string;
  entryContext: UpcomingExpenseEntryContext;
  plannedSource?: UpcomingExpensePlannedSource;
};

const normalizedDescription = (value: string) =>
  value.normalize('NFC').replace(/\s+/gu, ' ').trim();

function authorizeReplay(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  saved: UpcomingExpense,
) {
  const current = repository.upcomingExpenses.get(saved.id);
  if (!current) throw new Error('Finance record not found.');
  sourceIntersection(repository, actor, current);
}

function requestIntent(operation: string, expenseId: string, input: unknown) {
  return JSON.stringify({ operation, expenseId, input });
}

function assertReplayIntent(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  mutationId: string,
  intent: string,
  message = 'Upcoming expense mutation identity conflict.',
) {
  const saved = repository.mutationIntent(actor.id, mutationId);
  if (saved !== undefined && saved !== intent) throw new Error(message);
}

function rememberIntent<T>(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  mutationId: string,
  intent: string,
  result: T,
) {
  return repository.rememberIntent(actor.id, mutationId, intent, result);
}

function sourceIntersection(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expense: Pick<UpcomingExpense, 'accountId' | 'budgetId' | 'groupId'>,
) {
  const account = repository.accounts.get(expense.accountId);
  const budget = repository.budgets.get(expense.budgetId);
  const membership = actor.groupMemberships.find(({ groupId }) => groupId === expense.groupId);
  if (
    !account ||
    !budget ||
    budget.groupId !== expense.groupId ||
    !membership ||
    !authorizeFinanceScope(actor, account.scope, 'edit').allowed ||
    (account.scope.type === 'group' && account.scope.groupId !== expense.groupId)
  )
    throw new Error('Finance record not found.');
  return { account, budget };
}

function envelope(repository: FinanceMemoryRepository, expense: UpcomingExpense) {
  const fulfillments = fulfillmentsForExpense(repository, expense.id);
  const claimVersions = Object.fromEntries(
    [...new Set(fulfillments.map(({ transactionId }) => transactionId))].map((transactionId) => [
      transactionId,
      repository.fulfillmentClaimVersions.get(transactionId) ?? 0,
    ]),
  );
  const date = localFinanceDate(new Date().toISOString(), 'UTC');
  return {
    expense,
    fulfillments,
    claimVersions,
    ...deriveUpcomingExpenseState(expense, fulfillments, date),
  };
}

function publish(repository: FinanceMemoryRepository, expense: UpcomingExpense) {
  repository.feedChanges.push({
    // The account/budget/group intersection is rechecked on every read. Owner-only delivery avoids
    // placing a private-account obligation on a blanket group feed.
    audience: `OWNER#${expense.creatorId}`,
    entityType: 'financeUpcomingExpense',
    entityId: expense.id,
    version: expense.version,
    changedAt: expense.updatedAt,
    operation: expense.lifecycle === 'cancelled' ? 'tombstone' : 'upsert',
    ...(expense.lifecycle === 'active' ? { payload: expense } : {}),
  });
}

function publishFulfillment(
  repository: FinanceMemoryRepository,
  expense: UpcomingExpense,
  fulfillment: ExpenseFulfillment,
) {
  repository.feedChanges.push({
    audience: `OWNER#${expense.creatorId}`,
    entityType: 'financeFulfillment',
    entityId: fulfillment.id,
    version: fulfillment.version,
    changedAt: fulfillment.updatedAt,
    operation: fulfillment.status === 'removed' ? 'tombstone' : 'upsert',
    ...(fulfillment.status === 'active' ? { payload: fulfillment } : {}),
  });
}

export function createUpcomingExpenseRecord(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: CreateInput,
  mutationId: string,
) {
  const intent = requestIntent('create', input.id ?? '', input);
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) {
    const saved = replay.expense;
    authorizeReplay(repository, actor, saved);
    assertReplayIntent(repository, actor, mutationId, intent);
    if (
      (input.id !== undefined && input.id !== saved.id) ||
      input.groupId !== saved.groupId ||
      input.accountId !== saved.accountId ||
      input.budgetId !== saved.budgetId ||
      normalizedDescription(input.description) !== saved.description ||
      input.expectedAmountMinor !== saved.expectedAmountMinor ||
      input.dueDate !== saved.dueDate ||
      JSON.stringify(input.entryContext) !== JSON.stringify(saved.entryContext) ||
      JSON.stringify(input.plannedSource) !== JSON.stringify(saved.plannedSource)
    )
      throw new Error('Upcoming expense mutation identity conflict.');
    return replay;
  }
  const { account, budget } = sourceIntersection(repository, actor, input);
  if (!isBudgetEligibleForNewUpcoming(budget))
    throw new Error('Budget is not active and eligible for a new upcoming expense.');
  const expense = createUpcomingExpense({
    ...input,
    id: input.id ?? createUlid(),
    currency: account.currency,
    creatorId: actor.id,
  });
  if (repository.upcomingExpenses.has(expense.id))
    throw new Error('Upcoming expense identity conflict.');
  if (expense.plannedSource) {
    const key = plannedSourceIdentity(expense.plannedSource);
    if (repository.upcomingPlannedSourceLocks.has(key))
      throw new Error('Planned source occurrence already has a canonical obligation.');
    repository.upcomingPlannedSourceLocks.set(key, expense.id);
  }
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  return rememberIntent(repository, actor, mutationId, intent, envelope(repository, expense));
}

export function getUpcomingExpenseRecord(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
) {
  const expense = repository.upcomingExpenses.get(expenseId);
  if (!expense) return undefined;
  try {
    sourceIntersection(repository, actor, expense);
  } catch {
    return undefined;
  }
  return envelope(repository, expense);
}

export function listUpcomingExpenseRecords(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  filters: { accountId?: string; includeClosed?: boolean } = {},
) {
  return [...repository.upcomingExpenses.values()]
    .flatMap((expense) => {
      if (filters.accountId && expense.accountId !== filters.accountId) return [];
      if (!filters.includeClosed && expense.lifecycle !== 'active') return [];
      try {
        sourceIntersection(repository, actor, expense);
        return [envelope(repository, expense)];
      } catch {
        return [];
      }
    })
    .sort(
      (left, right) =>
        left.expense.dueDate.localeCompare(right.expense.dueDate) ||
        left.expense.id.localeCompare(right.expense.id),
    );
}

/** Emit content-free owner tombstones when the account/budget/group intersection is revoked. */
export function revokeUpcomingExpenseOwnerProjection(
  repository: FinanceMemoryRepository,
  ownerId: string,
  expenseId: string,
  changedAt = new Date().toISOString(),
) {
  const expense = repository.upcomingExpenses.get(expenseId);
  if (!expense) return [];
  const changes = upcomingExpenseRevocationTombstones({
    ownerId,
    expense,
    fulfillments: fulfillmentsForExpense(repository, expenseId),
    changedAt,
  });
  repository.feedChanges.push(...changes);
  return changes;
}

function editableExpense(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
) {
  const expense = repository.upcomingExpenses.get(expenseId);
  if (!expense) throw new Error('Finance record not found.');
  sourceIntersection(repository, actor, expense);
  return expense;
}

export function rescheduleUpcomingExpenseRecord(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
  input: {
    dueDate: string;
    dateChangeContext: UpcomingExpenseEntryContext;
    expectedVersion: number;
  },
  mutationId: string,
) {
  const intent = requestIntent('reschedule', expenseId, input);
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) {
    authorizeReplay(repository, actor, replay.expense);
    assertReplayIntent(repository, actor, mutationId, intent);
    const dateChange = replay.expense.dateChangeHistory.at(-1);
    if (
      replay.expense.id !== expenseId ||
      replay.expense.version !== input.expectedVersion + 1 ||
      replay.expense.dueDate !== input.dueDate ||
      JSON.stringify(dateChange?.context) !== JSON.stringify(input.dateChangeContext)
    )
      throw new Error('Upcoming expense mutation identity conflict.');
    return replay;
  }
  const current = editableExpense(repository, actor, expenseId);
  if (current.version !== input.expectedVersion)
    throw new Error('Upcoming expense version conflict.');
  // Existing budget activity is deliberately not rechecked here; the unchanged association stays manageable.
  const expense = rescheduleUpcomingExpense(
    current,
    input.dueDate,
    input.dateChangeContext,
    actor.id,
  );
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  return rememberIntent(repository, actor, mutationId, intent, envelope(repository, expense));
}

export function updateUpcomingExpenseRecord(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
  input: {
    description?: string;
    expectedAmountMinor?: number;
    groupId?: string;
    accountId?: string;
    budgetId?: string;
    plannedSource?: UpcomingExpensePlannedSource | null;
    expectedVersion: number;
  },
  mutationId: string,
) {
  const intent = requestIntent('update', expenseId, input);
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) {
    authorizeReplay(repository, actor, replay.expense);
    assertReplayIntent(repository, actor, mutationId, intent);
    const saved = replay.expense;
    if (
      saved.id !== expenseId ||
      saved.version !== input.expectedVersion + 1 ||
      (input.description !== undefined &&
        saved.description !== normalizedDescription(input.description)) ||
      (input.expectedAmountMinor !== undefined &&
        saved.expectedAmountMinor !== input.expectedAmountMinor) ||
      (input.groupId !== undefined && saved.groupId !== input.groupId) ||
      (input.accountId !== undefined && saved.accountId !== input.accountId) ||
      (input.budgetId !== undefined && saved.budgetId !== input.budgetId) ||
      (input.plannedSource !== undefined &&
        JSON.stringify(saved.plannedSource) !==
          JSON.stringify(input.plannedSource === null ? undefined : input.plannedSource))
    )
      throw new Error('Upcoming expense mutation identity conflict.');
    return replay;
  }
  const current = editableExpense(repository, actor, expenseId);
  if (current.version !== input.expectedVersion)
    throw new Error('Upcoming expense version conflict.');
  const proposed = {
    ...current,
    groupId: input.groupId ?? current.groupId,
    accountId: input.accountId ?? current.accountId,
    budgetId: input.budgetId ?? current.budgetId,
  };
  const reassigned =
    proposed.groupId !== current.groupId ||
    proposed.accountId !== current.accountId ||
    proposed.budgetId !== current.budgetId;
  const { account, budget } = sourceIntersection(repository, actor, proposed);
  if (reassigned && !isBudgetEligibleForNewUpcoming(budget))
    throw new Error('Budget is not active and eligible for reassignment.');
  const activeClaims = fulfillmentsForExpense(repository, current.id).filter(
    ({ status }) => status === 'active',
  );
  if (activeClaims.length && proposed.accountId !== current.accountId)
    throw new Error('Remove active fulfillment claims before changing the account.');
  if (proposed.accountId !== current.accountId && account.currency !== current.currency)
    throw new Error('Upcoming expense currency cannot change across accounts.');
  const previousSource = current.plannedSource
    ? plannedSourceIdentity(current.plannedSource)
    : undefined;
  const nextSource =
    input.plannedSource === null
      ? undefined
      : input.plannedSource
        ? plannedSourceIdentity(input.plannedSource)
        : previousSource;
  if (nextSource !== previousSource) {
    if (nextSource && repository.upcomingPlannedSourceLocks.has(nextSource))
      throw new Error('Planned source occurrence already has a canonical obligation.');
    if (previousSource) repository.upcomingPlannedSourceLocks.delete(previousSource);
    if (nextSource) repository.upcomingPlannedSourceLocks.set(nextSource, current.id);
  }
  const expense = editUpcomingExpense(current, {
    ...(input.description === undefined ? {} : { description: input.description }),
    ...(input.expectedAmountMinor === undefined
      ? {}
      : { expectedAmountMinor: input.expectedAmountMinor }),
    ...(input.groupId === undefined ? {} : { groupId: input.groupId }),
    ...(input.accountId === undefined ? {} : { accountId: input.accountId }),
    ...(input.budgetId === undefined ? {} : { budgetId: input.budgetId }),
    ...(input.plannedSource === undefined ? {} : { plannedSource: input.plannedSource }),
  });
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  return rememberIntent(repository, actor, mutationId, intent, envelope(repository, expense));
}

export function cancelUpcomingExpenseRecord(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
  expectedVersion: number,
  mutationId: string,
) {
  const intent = requestIntent('cancel', expenseId, { expectedVersion });
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) {
    authorizeReplay(repository, actor, replay.expense);
    assertReplayIntent(repository, actor, mutationId, intent);
    if (
      replay.expense.id !== expenseId ||
      replay.expense.version !== expectedVersion + 1 ||
      replay.expense.lifecycle !== 'cancelled'
    )
      throw new Error('Upcoming expense mutation identity conflict.');
    return replay;
  }
  const current = editableExpense(repository, actor, expenseId);
  if (current.version !== expectedVersion) throw new Error('Upcoming expense version conflict.');
  const expense = cancelUpcomingExpense(current, actor.id);
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  return rememberIntent(repository, actor, mutationId, intent, envelope(repository, expense));
}

export function reopenUpcomingExpenseRecord(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
  input: {
    dueDate: string;
    dateChangeContext: UpcomingExpenseEntryContext;
    expectedVersion: number;
  },
  mutationId: string,
) {
  const intent = requestIntent('reopen', expenseId, input);
  const replay = repository.mutation<ReturnType<typeof envelope>>(actor.id, mutationId);
  if (replay) {
    authorizeReplay(repository, actor, replay.expense);
    assertReplayIntent(repository, actor, mutationId, intent);
    const dateChange = replay.expense.dateChangeHistory.at(-1);
    if (
      replay.expense.id !== expenseId ||
      replay.expense.version !== input.expectedVersion + 1 ||
      replay.expense.lifecycle !== 'active' ||
      replay.expense.dueDate !== input.dueDate ||
      JSON.stringify(dateChange?.context) !== JSON.stringify(input.dateChangeContext)
    )
      throw new Error('Upcoming expense mutation identity conflict.');
    return replay;
  }
  const current = editableExpense(repository, actor, expenseId);
  const { budget } = sourceIntersection(repository, actor, current);
  if (current.version !== input.expectedVersion)
    throw new Error('Upcoming expense version conflict.');
  if (!isBudgetEligibleForNewUpcoming(budget))
    throw new Error('Budget is not active and eligible to reopen this expense.');
  const expense = reopenUpcomingExpense(current, input.dueDate, input.dateChangeContext, actor.id);
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  return rememberIntent(repository, actor, mutationId, intent, envelope(repository, expense));
}

export function linkUpcomingExpenseFulfillment(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
  input: {
    id?: string;
    transactionId: string;
    amountMinor: number;
    expectedExpenseVersion: number;
    expectedTransactionVersion: number;
    expectedClaimVersion: number;
  },
  mutationId: string,
) {
  const intent = requestIntent('link-fulfillment', expenseId, input);
  const replay = repository.mutation<ReturnType<typeof envelope> & { claimVersion: number }>(
    actor.id,
    mutationId,
  );
  if (replay) {
    authorizeReplay(repository, actor, replay.expense);
    assertReplayIntent(
      repository,
      actor,
      mutationId,
      intent,
      'Fulfillment mutation identity conflict.',
    );
    const canonicalId = repository.resolveTransactionId(input.transactionId);
    const saved = replay.fulfillments.find(
      ({ transactionId }) => repository.resolveTransactionId(transactionId) === canonicalId,
    );
    if (
      replay.expense.id !== expenseId ||
      replay.expense.version !== input.expectedExpenseVersion + 1 ||
      replay.claimVersion !== input.expectedClaimVersion + 1 ||
      !saved ||
      saved.amountMinor !== input.amountMinor ||
      saved.transactionVersion !== input.expectedTransactionVersion ||
      (input.id && input.id !== saved.id)
    )
      throw new Error('Fulfillment mutation identity conflict.');
    return replay;
  }
  const current = editableExpense(repository, actor, expenseId);
  const transactionId = repository.resolveTransactionId(input.transactionId);
  const transaction = repository.transactions.find(({ id }) => id === transactionId);
  const account = transaction ? repository.accounts.get(transaction.accountId) : undefined;
  if (!transaction || !account || !authorizeFinanceScope(actor, account.scope, 'edit').allowed)
    throw new Error('Finance record not found.');
  if (
    current.version !== input.expectedExpenseVersion ||
    transaction.version !== input.expectedTransactionVersion
  )
    throw new Error('Upcoming expense source version conflict.');
  const claimVersion = repository.fulfillmentClaimVersions.get(transaction.id) ?? 0;
  if (claimVersion !== input.expectedClaimVersion)
    throw new Error('Fulfillment claim version conflict.');
  const fulfillment = createExpenseFulfillment({
    id: input.id ?? createUlid(),
    expense: current,
    transaction,
    amountMinor: input.amountMinor,
    existing: fulfillmentsForTransaction(repository, transaction.id),
    actorId: actor.id,
  });
  storeExpenseFulfillment(repository, fulfillment);
  repository.fulfillmentClaimVersions.set(transaction.id, claimVersion + 1);
  const expense = { ...current, updatedAt: fulfillment.updatedAt, version: current.version + 1 };
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  publishFulfillment(repository, expense, fulfillment);
  const result = { ...envelope(repository, expense), claimVersion: claimVersion + 1 };
  return rememberIntent(repository, actor, mutationId, intent, result);
}

export function unlinkUpcomingExpenseFulfillment(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  expenseId: string,
  fulfillmentId: string,
  input: {
    expectedExpenseVersion: number;
    expectedFulfillmentVersion: number;
    expectedTransactionVersion: number;
    expectedClaimVersion: number;
  },
  mutationId: string,
) {
  const intent = requestIntent('unlink-fulfillment', expenseId, { fulfillmentId, ...input });
  const replay = repository.mutation<ReturnType<typeof envelope> & { claimVersion: number }>(
    actor.id,
    mutationId,
  );
  if (replay) {
    authorizeReplay(repository, actor, replay.expense);
    assertReplayIntent(
      repository,
      actor,
      mutationId,
      intent,
      'Fulfillment mutation identity conflict.',
    );
    const removed = replay.fulfillments.find(({ id }) => id === fulfillmentId);
    const transaction = removed
      ? repository.transactions.find(
          ({ id }) => id === repository.resolveTransactionId(removed.transactionId),
        )
      : undefined;
    if (
      replay.expense.id !== expenseId ||
      replay.expense.version !== input.expectedExpenseVersion + 1 ||
      replay.claimVersion !== input.expectedClaimVersion + 1 ||
      !removed ||
      removed.status !== 'removed' ||
      removed.version !== input.expectedFulfillmentVersion + 1 ||
      transaction?.version !== input.expectedTransactionVersion
    )
      throw new Error('Fulfillment mutation identity conflict.');
    return replay;
  }
  const current = editableExpense(repository, actor, expenseId);
  const fulfillment = repository.expenseFulfillments.get(fulfillmentId);
  const transaction = fulfillment
    ? repository.transactions.find(({ id }) => id === fulfillment.transactionId)
    : undefined;
  if (!fulfillment || !transaction || fulfillment.upcomingExpenseId !== current.id)
    throw new Error('Finance record not found.');
  const account = repository.accounts.get(transaction.accountId);
  if (!account || !authorizeFinanceScope(actor, account.scope, 'edit').allowed)
    throw new Error('Finance record not found.');
  const claimVersion = repository.fulfillmentClaimVersions.get(transaction.id) ?? 0;
  if (
    current.version !== input.expectedExpenseVersion ||
    fulfillment.version !== input.expectedFulfillmentVersion ||
    transaction.version !== input.expectedTransactionVersion ||
    claimVersion !== input.expectedClaimVersion
  )
    throw new Error('Fulfillment unlink version conflict.');
  const removed = removeExpenseFulfillment(fulfillment);
  storeExpenseFulfillment(repository, removed);
  repository.fulfillmentClaimVersions.set(transaction.id, claimVersion + 1);
  const expense = { ...current, updatedAt: removed.updatedAt, version: current.version + 1 };
  repository.upcomingExpenses.set(expense.id, expense);
  publish(repository, expense);
  publishFulfillment(repository, expense, removed);
  const result = { ...envelope(repository, expense), claimVersion: claimVersion + 1 };
  return rememberIntent(repository, actor, mutationId, intent, result);
}

/** Transaction corrections never leave an overstated paid contribution. */
export function reviewExpenseFulfillmentsForTransaction(
  repository: FinanceMemoryRepository,
  transactionId: string,
) {
  const canonicalId = repository.resolveTransactionId(transactionId);
  const transaction = repository.transactions.find(({ id }) => id === canonicalId);
  const claims = fulfillmentsForTransaction(repository, canonicalId).filter(
    ({ status }) => status === 'active',
  );
  if (!claims.length) return;
  const eligible =
    transaction &&
    transaction.status === 'active' &&
    !transaction.transferId &&
    Number.isSafeInteger(transaction.amountMinor) &&
    transaction.amountMinor < 0;
  const claimed = claims.reduce((sum, claim) => sum + claim.amountMinor, 0);
  const capacityValid = Boolean(eligible && claimed <= -transaction!.amountMinor);
  const posted = Boolean(
    capacityValid &&
      transaction!.postedAt &&
      !transaction!.pending &&
      transaction!.reviewState === 'none' &&
      transaction!.reconciliationState !== 'provisional' &&
      transaction!.reconciliationState !== 'review-required',
  );
  for (const claim of claims) {
    const calculationState = capacityValid
      ? posted
        ? 'valid'
        : 'awaiting-posting'
      : 'needs-review';
    if (
      claim.calculationState === calculationState &&
      transaction &&
      claim.transactionVersion === transaction.version
    )
      continue;
    const reviewed: ExpenseFulfillment = {
      ...claim,
      calculationState,
      ...(transaction ? { transactionVersion: transaction.version } : {}),
      updatedAt: new Date().toISOString(),
      version: claim.version + 1,
    };
    repository.expenseFulfillments.set(claim.id, reviewed);
    const expense = repository.upcomingExpenses.get(claim.upcomingExpenseId);
    if (expense) publishFulfillment(repository, expense, reviewed);
  }
}
