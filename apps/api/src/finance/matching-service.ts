import { itemsForBudget, allocationBudgetId, itemBudgetIds } from './budget-membership.js';
import {
  acceptAutomaticTransactionMatch,
  copyReusableBudgetItem,
  createReusableBudgetItem,
  createTransactionMatch,
  decideTransactionMatch,
  financeAudience,
  invalidateTransactionMatch,
  replaceTransactionAllocations,
  reusableOccurrenceDates,
  scoreTransactionMatch,
  undoTransactionMatch,
  type BudgetItem,
  type CreateReusableBudgetItemInput,
  type FinancialTransaction,
  type ReusableBudgetItem,
  type TransactionMatch,
} from '@naaseh/domain';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';
import { addFinanceBudgetItem } from './budget-service.js';
import { FinanceMemoryRepository } from './repository.js';
import { markFinanceBudgetsChangedByTransaction } from './reconciliation-service.js';

const groupScope = (groupId: string) => ({ type: 'group' as const, groupId });
const occurrenceKey = (reusableItemId: string, occurrenceDate: string, budgetId: string) =>
  `${reusableItemId}:${occurrenceDate}:${budgetId}`;

const authorizedBudget = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  action: 'read' | 'edit' = 'read',
) => {
  const budget = repository.budgets.get(budgetId);
  if (
    !budget ||
    budget.status === 'tombstone' ||
    !authorizeFinanceScope(actor, groupScope(budget.groupId), action).allowed
  ) {
    throw new Error('Finance record not found.');
  }
  return budget;
};

const authorizedReusable = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  reusableItemId: string,
  action: 'read' | 'edit' = 'read',
) => {
  const item = repository.reusableItems.get(reusableItemId);
  if (
    !item ||
    item.status === 'tombstone' ||
    !authorizeFinanceScope(actor, groupScope(item.groupId), action).allowed
  ) {
    throw new Error('Finance record not found.');
  }
  return item;
};

const authorizedTransaction = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  action: 'read' | 'edit' = 'read',
) => {
  const index = repository.transactions.findIndex(({ id }) => id === transactionId);
  const transaction = repository.transactions[index];
  const account = transaction ? repository.accounts.get(transaction.accountId) : undefined;
  if (!transaction || !account || !authorizeFinanceScope(actor, account.scope, action).allowed) {
    throw new Error('Finance record not found.');
  }
  return { index, transaction, account };
};

const canReadBudgetItem = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  item: BudgetItem,
) => {
  const budget = repository.budgets.get(item.budgetId);
  return (
    budget &&
    budget.status !== 'archived' &&
    budget.status !== 'tombstone' &&
    Boolean(
      repository.budgetItems.get(item.id) &&
        itemBudgetIds(repository, repository.budgetItems.get(item.id)!).includes(budget.id),
    ) &&
    authorizeFinanceScope(actor, groupScope(budget.groupId), 'read').allowed &&
    item.relatedAccountIds.every((id) => {
      const account = repository.accounts.get(id);
      return account && authorizeFinanceScope(actor, account.scope, 'read').allowed;
    })
  );
};

const recordReusableFeed = (repository: FinanceMemoryRepository, item: ReusableBudgetItem) => {
  repository.feedChanges.push({
    audience: financeAudience(groupScope(item.groupId)),
    entityType: 'financeReusableItem',
    entityId: item.id,
    version: item.version,
    changedAt: new Date().toISOString(),
    operation: item.status === 'tombstone' ? 'tombstone' : 'upsert',
    payload: item,
  });
};

const recordMatchFeed = (
  repository: FinanceMemoryRepository,
  transaction: FinancialTransaction,
  match: TransactionMatch,
) => {
  const account = repository.accounts.get(transaction.accountId);
  if (!account) return;
  repository.feedChanges.push({
    audience: financeAudience(account.scope),
    entityType: 'financeTransactionMatch',
    entityId: match.id,
    version: match.version,
    changedAt: new Date().toISOString(),
    operation: match.status === 'tombstone' ? 'tombstone' : 'upsert',
    payload: match,
  });
};

export async function createFinanceReusableItem(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  input: Omit<CreateReusableBudgetItemInput, 'creatorId'>,
  mutationId: string,
) {
  const replay = repository.mutation<ReusableBudgetItem>(actor, mutationId);
  if (replay) return replay;
  if (!authorizeFinanceScope(actor, groupScope(input.groupId), 'edit').allowed) {
    throw new Error('Finance record not found.');
  }
  for (const accountId of input.relatedAccountIds) {
    const account = repository.accounts.get(accountId);
    if (
      !account ||
      account.status !== 'active' ||
      account.currency !== input.currency ||
      account.scope.type !== 'group' ||
      account.scope.groupId !== input.groupId ||
      !authorizeFinanceScope(actor, account.scope, 'read').allowed
    ) {
      throw new Error('Finance record not found.');
    }
  }
  const item = createReusableBudgetItem({ ...input, creatorId: actor.id });
  if (repository.reusableItems.has(item.id)) throw new Error('Reusable item already exists.');
  repository.reusableItems.set(item.id, item);
  recordReusableFeed(repository, item);
  return repository.remember(actor.id, mutationId, item);
}

export function listFinanceReusableItems(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  groupId?: string,
) {
  return {
    items: [...repository.reusableItems.values()]
      .filter((item) => item.status !== 'tombstone' && (!groupId || item.groupId === groupId))
      .filter((item) => authorizeFinanceScope(actor, groupScope(item.groupId), 'read').allowed)
      .sort(
        (left, right) =>
          left.description.localeCompare(right.description) || left.id.localeCompare(right.id),
      ),
    cursor: null,
  };
}

export interface ReusableOffer {
  reusableItemId: string;
  occurrenceDate: string;
  description: string;
  plannedAmountMinor: number;
  currency: string;
  currencyExponent: number;
}

export function listReusableOffers(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
): ReusableOffer[] {
  const budget = authorizedBudget(repository, actor, budgetId);
  return [...repository.reusableItems.values()]
    .filter((item) => item.groupId === budget.groupId && item.status === 'active')
    .flatMap((item) =>
      reusableOccurrenceDates(item, { startDate: budget.startDate, endDate: budget.endDate })
        .filter(
          (date) =>
            !repository.reusableOccurrenceLocks.has(occurrenceKey(item.id, date, budget.id)),
        )
        .map((occurrenceDate) => ({
          reusableItemId: item.id,
          occurrenceDate,
          description: item.description,
          plannedAmountMinor: item.plannedAmountMinor,
          currency: item.currency,
          currencyExponent: item.currencyExponent,
        })),
    )
    .sort(
      (left, right) =>
        left.occurrenceDate.localeCompare(right.occurrenceDate) ||
        left.reusableItemId.localeCompare(right.reusableItemId),
    );
}

export async function copyReusableItemToBudget(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  budgetId: string,
  reusableItemId: string,
  occurrenceDate: string,
  budgetItemId: string,
  expectedBudgetVersion: number,
  mutationId: string,
) {
  const replay = repository.mutation<BudgetItem>(actor, mutationId);
  if (replay) return replay;
  const budget = authorizedBudget(repository, actor, budgetId, 'edit');
  const reusable = authorizedReusable(repository, actor, reusableItemId);
  if (
    reusable.groupId !== budget.groupId ||
    !reusableOccurrenceDates(reusable, {
      startDate: budget.startDate,
      endDate: budget.endDate,
    }).includes(occurrenceDate)
  )
    throw new Error('Finance record not found.');
  const key = occurrenceKey(reusable.id, occurrenceDate, budget.id);
  if (repository.reusableOccurrenceLocks.has(key))
    throw new Error('Reusable occurrence is already copied.');
  const candidate = copyReusableBudgetItem(reusable, {
    id: budgetItemId,
    budgetId,
    creatorId: actor.id,
    occurrenceDate,
  });
  const copied = await addFinanceBudgetItem(
    repository,
    actor,
    budgetId,
    {
      id: candidate.id,
      expectedBudgetVersion,
      sourceReusableItemId: reusable.id,
      description: candidate.description,
      ...(candidate.merchantId ? { merchantId: candidate.merchantId } : {}),
      financeCategoryId: candidate.financeCategoryId,
      plannedAmountMinor: candidate.plannedAmountMinor,
      currency: candidate.currency,
      currencyExponent: candidate.currencyExponent,
      applicableDate: occurrenceDate,
      relatedAccountIds: candidate.relatedAccountIds,
    },
    `${mutationId}:budget-item`,
  );
  repository.reusableOccurrenceLocks.set(key, copied.id);
  return repository.remember(actor.id, mutationId, copied);
}

const candidateItems = (repository: FinanceMemoryRepository, actor: FinanceActor) => {
  const budgets = [...repository.budgets.values()].filter(
    (budget) => authorizeFinanceScope(actor, groupScope(budget.groupId), 'read').allowed,
  );
  return {
    budgets,
    items: budgets.flatMap((budget) =>
      itemsForBudget(repository, budget.id).filter((item) =>
        canReadBudgetItem(repository, actor, item),
      ),
    ),
  };
};

function allocationInputsForMatch(transaction: FinancialTransaction, item: BudgetItem) {
  if (transaction.allocations.length === 0)
    return [
      {
        id: `${transaction.id}:${item.id}`,
        amountMinor: transaction.amountMinor,
        financeCategoryId: item.financeCategoryId,
        budgetItemId: item.id,
        budgetId: item.budgetId,
      },
    ];
  if (
    transaction.allocations.length !== 1 ||
    transaction.allocations[0]!.amountMinor !== transaction.amountMinor
  ) {
    throw new Error('Transaction allocations require conflict review before matching.');
  }
  return transaction.allocations.map((allocation) => ({
    id: allocation.id,
    amountMinor: allocation.amountMinor,
    financeCategoryId: allocation.financeCategoryId,
    budgetItemId: item.id,
    budgetId: item.budgetId,
    ...(allocation.note ? { note: allocation.note } : {}),
  }));
}

function attachMatchAllocation(
  repository: FinanceMemoryRepository,
  transaction: FinancialTransaction,
  item: BudgetItem,
  actorId: string,
) {
  if (
    transaction.allocations.some(
      (allocation) =>
        allocation.budgetItemId && allocationBudgetId(repository, allocation) !== item.budgetId,
    )
  )
    throw new Error('A transaction can belong to only one budget.');
  return replaceTransactionAllocations(
    transaction,
    allocationInputsForMatch(transaction, item),
    actorId,
  );
}

function detachMatchAllocation(
  transaction: FinancialTransaction,
  budgetItemId: string,
  actorId: string,
  budgetId?: string,
) {
  const matchesItem = (allocation: { budgetItemId?: string; budgetId?: string }) =>
    allocation.budgetItemId === budgetItemId &&
    (!budgetId || !allocation.budgetId || allocation.budgetId === budgetId);
  const values = transaction.allocations.map((allocation) => ({
    id: allocation.id,
    amountMinor: allocation.amountMinor,
    financeCategoryId: allocation.financeCategoryId,
    ...(matchesItem(allocation)
      ? {}
      : allocation.budgetItemId
        ? {
            budgetItemId: allocation.budgetItemId,
            ...(allocation.budgetId ? { budgetId: allocation.budgetId } : {}),
          }
        : {}),
    ...(allocation.note ? { note: allocation.note } : {}),
  }));
  const allocationTotal = values.reduce((sum, allocation) => sum + allocation.amountMinor, 0);
  if (allocationTotal === transaction.amountMinor) {
    return replaceTransactionAllocations(transaction, values, actorId);
  }
  const updatedAt = new Date().toISOString();
  return {
    ...transaction,
    allocations: transaction.allocations.map((allocation) => {
      const detached = { ...allocation };
      if (matchesItem(detached)) {
        delete detached.budgetItemId;
        delete detached.budgetId;
      }
      return { ...detached, updatedAt };
    }),
    version: transaction.version + 1,
  };
}

export async function evaluateFinanceTransactionMatches(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
  nextId: () => string,
  mutationId: string,
) {
  const replay = repository.mutation<TransactionMatch[]>(actor, mutationId);
  if (replay) return replay;
  const authorized = authorizedTransaction(repository, actor, transactionId, 'edit');
  if (authorized.transaction.allocations.some(({ budgetItemId }) => budgetItemId)) {
    throw new Error('Transaction is already matched.');
  }
  const { budgets, items } = candidateItems(repository, actor);
  const candidates = items.flatMap((item) => {
    const budget = budgets.find((budget) => budget.id === item.budgetId)!;
    const score = scoreTransactionMatch(authorized.transaction, item, budget);
    return score ? [{ ...score, budgetId: budget.id }] : [];
  });
  const exact = candidates.filter((candidate) => candidate.kind === 'exact');
  const automatic = exact.length === 1 ? exact[0] : undefined;
  const matches = candidates.map((candidate) =>
    createTransactionMatch({
      id: nextId(),
      transactionId,
      budgetItemId: candidate.budgetItemId,
      budgetId: candidate.budgetId,
      kind: candidate.kind,
      scoreBasis: candidate.scoreBasis,
    }),
  );
  if (automatic) {
    const match = matches.find(
      ({ budgetItemId, budgetId }) =>
        budgetItemId === automatic.budgetItemId && budgetId === automatic.budgetId,
    )!;
    const item = { ...repository.budgetItems.get(match.budgetItemId)!, budgetId: match.budgetId! };
    const accepted = acceptAutomaticTransactionMatch(match);
    matches[matches.indexOf(match)] = accepted;
    authorized.transaction = attachMatchAllocation(
      repository,
      authorized.transaction,
      item,
      actor.id,
    );
    repository.transactions[authorized.index] = authorized.transaction;
    markFinanceBudgetsChangedByTransaction(repository, authorized.transaction);
  }
  for (const match of matches) {
    repository.transactionMatches.set(match.id, match);
    recordMatchFeed(repository, authorized.transaction, match);
  }
  return repository.remember(actor.id, mutationId, matches);
}

const authorizedMatch = (
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  matchId: string,
) => {
  const match = repository.transactionMatches.get(matchId);
  const storedItem = match ? repository.budgetItems.get(match.budgetItemId) : undefined;
  const item =
    storedItem && match
      ? { ...storedItem, budgetId: match.budgetId ?? storedItem.budgetId }
      : undefined;
  if (!match || !item || !canReadBudgetItem(repository, actor, item))
    throw new Error('Finance record not found.');
  const authorized = authorizedTransaction(repository, actor, match.transactionId, 'edit');
  return { match, ...authorized };
};

export function listFinanceTransactionMatches(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  transactionId: string,
) {
  const { transaction } = authorizedTransaction(repository, actor, transactionId);
  return {
    items: [...repository.transactionMatches.values()].filter(
      (match) =>
        match.transactionId === transactionId &&
        match.status !== 'tombstone' &&
        Boolean(
          repository.budgetItems.get(match.budgetItemId) &&
            canReadBudgetItem(repository, actor, {
              ...repository.budgetItems.get(match.budgetItemId)!,
              budgetId: match.budgetId ?? repository.budgetItems.get(match.budgetItemId)!.budgetId,
            }),
        ),
    ),
    transactionVersion: transaction.version,
  };
}

export async function acceptFinanceTransactionMatch(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  matchId: string,
  expectedVersion: number,
  expectedTransactionVersion: number,
  mutationId: string,
) {
  const authorized = authorizedMatch(repository, actor, matchId);
  const replay = repository.mutation<TransactionMatch>(actor, mutationId);
  if (replay) return replay;
  if (
    authorized.match.version !== expectedVersion ||
    authorized.transaction.version !== expectedTransactionVersion
  )
    throw new Error('Finance match version conflict.');
  const storedItem = repository.budgetItems.get(authorized.match.budgetItemId);
  const item = storedItem
    ? { ...storedItem, budgetId: authorized.match.budgetId ?? storedItem.budgetId }
    : undefined;
  if (!item) throw new Error('Finance record not found.');
  const match = decideTransactionMatch(authorized.match, 'accepted', actor.id);
  const transaction = attachMatchAllocation(repository, authorized.transaction, item, actor.id);
  repository.transactionMatches.set(match.id, match);
  repository.transactions[authorized.index] = transaction;
  markFinanceBudgetsChangedByTransaction(repository, transaction);
  recordMatchFeed(repository, transaction, match);
  return repository.remember(actor.id, mutationId, match);
}

export async function rejectFinanceTransactionMatch(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  matchId: string,
  expectedVersion: number,
  expectedTransactionVersion: number,
  mutationId: string,
) {
  const replay = repository.mutation<TransactionMatch>(actor, mutationId);
  if (replay) return replay;
  const authorized = authorizedMatch(repository, actor, matchId);
  if (
    authorized.match.version !== expectedVersion ||
    authorized.transaction.version !== expectedTransactionVersion
  )
    throw new Error('Finance match version conflict.');
  const match = decideTransactionMatch(authorized.match, 'rejected', actor.id);
  repository.transactionMatches.set(match.id, match);
  recordMatchFeed(repository, authorized.transaction, match);
  return repository.remember(actor.id, mutationId, match);
}

export async function undoFinanceTransactionMatch(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
  matchId: string,
  expectedVersion: number,
  expectedTransactionVersion: number,
  mutationId: string,
) {
  const replay = repository.mutation<TransactionMatch>(actor, mutationId);
  if (replay) return replay;
  const authorized = authorizedMatch(repository, actor, matchId);
  if (
    authorized.match.version !== expectedVersion ||
    authorized.transaction.version !== expectedTransactionVersion
  )
    throw new Error('Finance match version conflict.');
  const match = undoTransactionMatch(authorized.match, actor.id);
  const transaction = detachMatchAllocation(
    authorized.transaction,
    match.budgetItemId,
    actor.id,
    match.budgetId,
  );
  repository.transactionMatches.set(match.id, match);
  repository.transactions[authorized.index] = transaction;
  markFinanceBudgetsChangedByTransaction(repository, transaction);
  recordMatchFeed(repository, transaction, match);
  return repository.remember(actor.id, mutationId, match);
}

export function invalidateChangedTransactionMatches(
  repository: FinanceMemoryRepository,
  transactionId: string,
) {
  const transactionIndex = repository.transactions.findIndex(({ id }) => id === transactionId);
  const storedTransaction = repository.transactions[transactionIndex];
  if (!storedTransaction) return [];
  let transaction: FinancialTransaction = storedTransaction;
  const invalidated: TransactionMatch[] = [];
  for (const [id, match] of repository.transactionMatches) {
    if (match.transactionId !== transactionId || !['suggested', 'accepted'].includes(match.status))
      continue;
    const storedItem = repository.budgetItems.get(match.budgetItemId);
    const item = storedItem
      ? { ...storedItem, budgetId: match.budgetId ?? storedItem.budgetId }
      : undefined;
    const budget = item ? repository.budgets.get(item.budgetId) : undefined;
    const score =
      item && storedItem && budget && itemBudgetIds(repository, storedItem).includes(budget.id)
        ? scoreTransactionMatch(transaction, item, budget)
        : undefined;
    if (!score || score.kind !== match.kind) {
      const changed = invalidateTransactionMatch(match);
      if (match.status === 'accepted') {
        transaction = detachMatchAllocation(
          transaction,
          match.budgetItemId,
          match.decidedBy ?? 'system',
          match.budgetId,
        );
        repository.transactions[transactionIndex] = transaction;
        markFinanceBudgetsChangedByTransaction(repository, transaction);
      }
      repository.transactionMatches.set(id, changed);
      recordMatchFeed(repository, transaction, changed);
      invalidated.push(changed);
    }
  }
  return invalidated;
}

export function invalidateBudgetTransactionSuggestions(
  repository: FinanceMemoryRepository,
  budgetId: string,
) {
  for (const [id, match] of repository.transactionMatches) {
    const item = repository.budgetItems.get(match.budgetItemId);
    if (match.status !== 'suggested' || (match.budgetId ?? item?.budgetId) !== budgetId) continue;
    const changed = invalidateTransactionMatch(match);
    repository.transactionMatches.set(id, changed);
    const transaction = repository.transactions.find(
      (transaction) => transaction.id === match.transactionId,
    );
    if (transaction) recordMatchFeed(repository, transaction, changed);
  }
}
