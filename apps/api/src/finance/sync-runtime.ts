import { createHash } from 'node:crypto';
import type { EntityType, Mutation, StableMutationResult } from '@naaseh/domain';
import {
  financeBudgetInputSchema,
  financeBudgetPatchSchema,
  financeBudgetItemInputSchema,
  financeBudgetAccountLinkInputSchema,
  financeReusableItemInputSchema,
  csvImportChunkInputSchema,
  manualFinanceTransactionInputSchema,
} from '@naaseh/contracts';
import type { FinanceActor } from './authorization.js';
import { authorizeFinanceScope } from './authorization.js';
import { DynamoFinanceRepository } from './durable-repository.js';
import type { FinanceMemoryRepository } from './repository.js';
import {
  createFinanceBudget,
  updateFinanceBudget,
  addFinanceBudgetItem,
  linkFinanceBudgetAccount,
  getFinanceBudget,
} from './budget-service.js';
import { authorizedFinancialTaskLinkForTask } from './task-link-service.js';
import { createFinanceReusableItem } from './matching-service.js';
import { commitAuthorizedCsvImportChunk, type CsvCommitChunk } from './csv-import-service.js';
import { createManualTransaction } from './transaction-service.js';

type Defined<T> = T extends readonly unknown[]
  ? { [K in keyof T]: Defined<T[K]> }
  : T extends object
    ? { [K in keyof T]: Defined<Exclude<T[K], undefined>> }
    : T;
const defined = <T>(value: T): Defined<T> => JSON.parse(JSON.stringify(value)) as Defined<T>;

export interface FinanceProjection {
  id: string;
  entityType: EntityType;
  scopeKey: string;
  version: number;
  value: unknown;
  accountId?: string;
  budgetId?: string;
}
export function authorizedFinanceProjection(
  repository: FinanceMemoryRepository,
  actor: FinanceActor,
): FinanceProjection[] {
  const records: FinanceProjection[] = [];
  const allowed = (scope: Parameters<typeof authorizeFinanceScope>[1]) =>
    authorizeFinanceScope(actor, scope, 'read').allowed;
  const accountIds = new Set(
    [...repository.accounts.values()].filter((item) => allowed(item.scope)).map((item) => item.id),
  );
  const add = <T extends { id: string; version?: number; accountId?: string; budgetId?: string }>(
    entityType: EntityType,
    value: T,
    scopeKey: string,
  ) =>
    records.push({
      id: value.id,
      entityType,
      scopeKey,
      version: value.version ?? 1,
      value,
      ...(value.accountId ? { accountId: value.accountId } : {}),
      ...(value.budgetId ? { budgetId: value.budgetId } : {}),
    });
  for (const account of repository.accounts.values())
    if (accountIds.has(account.id))
      add(
        'financeAccount',
        account,
        account.scope.type === 'owner'
          ? `OWNER#${account.scope.ownerId}`
          : `GROUP#${account.scope.groupId}`,
      );
  for (const transaction of repository.transactions)
    if (accountIds.has(transaction.accountId) && transaction.status === 'active') {
      const account = repository.accounts.get(transaction.accountId)!;
      add(
        'financeTransaction',
        transaction,
        account.scope.type === 'owner'
          ? `OWNER#${account.scope.ownerId}`
          : `GROUP#${account.scope.groupId}`,
      );
    }
  if (actor.active) {
    for (const item of repository.categories.values()) add('financeCategory', item, 'PUBLIC');
    for (const item of repository.merchants.values()) add('financeMerchant', item, 'PUBLIC');
  }
  const visibleItems = new Set<string>();
  for (const budget of repository.budgets.values())
    if (allowed({ type: 'group', groupId: budget.groupId }) && budget.status !== 'tombstone') {
      const view = getFinanceBudget(repository, actor, budget.id),
        scope = `GROUP#${budget.groupId}`;
      add(
        'financeBudget',
        {
          ...budget,
          totals: view.totals,
          categoryTotals: view.categoryTotals,
          totalsComplete: view.totalsComplete,
          reconciliationReadiness: view.reconciliationReadiness,
        },
        scope,
      );
      for (const link of view.accountLinks) add('financeBudgetAccountLink', link, scope);
      for (const item of view.items) {
        add('financeBudgetItem', item, scope);
        visibleItems.add(item.id);
      }
      for (const record of view.reconciliations) add('financeReconciliation', record, scope);
      for (const link of repository.financialTaskLinks.values())
        if (
          link.budgetId === budget.id &&
          link.status === 'active' &&
          visibleItems.has(link.budgetItemId) &&
          authorizedFinancialTaskLinkForTask(repository, actor, link.taskId)?.id === link.id
        )
          add('financeTaskLink', link, scope);
    }
  for (const item of repository.reusableItems.values())
    if (
      allowed({ type: 'group', groupId: item.groupId }) &&
      item.relatedAccountIds.every((id) => accountIds.has(id))
    )
      add('financeReusableItem', item, `GROUP#${item.groupId}`);
  for (const item of repository.transactionMatches.values())
    if (
      visibleItems.has(item.budgetItemId) &&
      repository.transactions.some(
        (tx) => tx.id === item.transactionId && accountIds.has(tx.accountId),
      )
    ) {
      const budgetId = item.budgetId ?? repository.budgetItems.get(item.budgetItemId)!.budgetId;
      const budget = repository.budgets.get(budgetId);
      if (budget && allowed({ type: 'group', groupId: budget.groupId }))
        add('financeTransactionMatch', item, `GROUP#${budget.groupId}`);
    }
  const merged = new Map<string, FinanceProjection>();
  for (const record of records) {
    if (record.entityType === 'financeBudgetItem') {
      const previous = merged.get(record.id);
      const item = record.value as {
        budgetId: string;
        actualAmountMinor?: number;
        varianceMinor?: number;
      };
      const old = previous?.value as
        | { budgetIds?: string[]; actualByBudget?: Record<string, unknown> }
        | undefined;
      record.value = {
        ...(record.value as object),
        budgetIds: [...(old?.budgetIds ?? []), item.budgetId],
        actualByBudget: {
          ...old?.actualByBudget,
          [item.budgetId]: {
            actualAmountMinor: item.actualAmountMinor,
            varianceMinor: item.varianceMinor,
          },
        },
      };
    }
    merged.set(record.id, record);
  }
  return [...merged.values()].sort(
    (a, b) => a.entityType.localeCompare(b.entityType) || a.id.localeCompare(b.id),
  );
}

export async function commitDurableCsv(
  actor: FinanceActor,
  input: CsvCommitChunk,
  store = new DynamoFinanceRepository(),
) {
  let result;
  // Every external chunk occupies five stable sub-chunk indices, including empty tails.
  for (let index = 0; index < 5; index++) {
    const session = await store.load();
    result = await commitAuthorizedCsvImportChunk(session.repository, actor, {
      ...input,
      chunkIndex: input.chunkIndex * 5 + index,
      finalChunk: input.finalChunk && index === 4,
      rows: input.rows.slice(index * 20, (index + 1) * 20),
    });
    await session.commit();
  }
  return result!;
}

export async function dispatchFinanceMutation(
  actor: FinanceActor,
  mutation: Mutation,
  store = new DynamoFinanceRepository(),
): Promise<StableMutationResult> {
  const payload = mutation.payload as Record<string, unknown>;
  try {
    if (!payload || typeof payload !== 'object') throw new Error('Invalid Finance mutation.');
    if (mutation.operation === 'commitCsvChunk') {
      const { accountId: _accountId, ...fields } = payload;
      void _accountId;
      const input = csvImportChunkInputSchema.parse(fields);
      if (typeof payload.accountId !== 'string') throw new Error('Invalid Finance account.');
      await commitDurableCsv(actor, { ...input, accountId: payload.accountId }, store);
      return { mutationId: mutation.id, status: 'applied', version: 1 };
    }
    const session = await store.load(),
      repository = session.repository;
    let entity: { version: number };
    if (mutation.entityType === 'financeBudget') {
      if (mutation.operation === 'create') {
        const input = defined(financeBudgetInputSchema.parse(payload));
        entity = await createFinanceBudget(
          repository,
          actor,
          {
            ...input,
            id: mutation.entityId,
            status: input.status === 'active' ? 'active' : 'draft',
          },
          mutation.id,
        );
      } else
        entity = await updateFinanceBudget(
          repository,
          actor,
          mutation.entityId,
          defined(
            financeBudgetPatchSchema.parse({ ...payload, expectedVersion: mutation.baseVersion }),
          ),
          mutation.id,
        );
    } else if (mutation.entityType === 'financeBudgetAccountLink') {
      const { budgetId: _budgetId, ...fields } = payload;
      void _budgetId;
      const input = financeBudgetAccountLinkInputSchema.parse({
        ...fields,
        expectedBudgetVersion: mutation.baseVersion,
      });
      if (typeof payload.budgetId !== 'string') throw new Error('Invalid Finance budget.');
      entity = await linkFinanceBudgetAccount(
        repository,
        actor,
        payload.budgetId,
        { ...input, id: mutation.entityId },
        mutation.id,
      );
    } else if (mutation.entityType === 'financeBudgetItem') {
      const { budgetId: _budgetId, ...fields } = payload;
      void _budgetId;
      const input = defined(
        financeBudgetItemInputSchema.parse({
          ...fields,
          expectedBudgetVersion: mutation.baseVersion,
        }),
      );
      if (typeof payload.budgetId !== 'string') throw new Error('Invalid Finance budget.');
      entity = await addFinanceBudgetItem(
        repository,
        actor,
        payload.budgetId,
        { ...input, id: mutation.entityId },
        mutation.id,
      );
    } else if (mutation.entityType === 'financeReusableItem' && mutation.operation === 'create') {
      entity = await createFinanceReusableItem(
        repository,
        actor,
        { ...defined(financeReusableItemInputSchema.parse(payload)), id: mutation.entityId },
        mutation.id,
      );
    } else if (mutation.entityType === 'financeTransaction' && mutation.operation === 'create') {
      const { accountId, ...values } = payload;
      if (typeof accountId !== 'string') throw new Error('Invalid Finance account.');
      entity = (await createManualTransaction(
        repository,
        actor,
        accountId,
        { ...defined(manualFinanceTransactionInputSchema.parse(values)), id: mutation.entityId },
        mutation.id,
      )) as { version: number };
    } else throw new Error('Unsupported Finance mutation.');
    await session.commit();
    return { mutationId: mutation.id, status: 'applied', version: entity.version };
  } catch (error) {
    if (
      error instanceof Error &&
      [
        'ThrottlingException',
        'ProvisionedThroughputExceededException',
        'TimeoutError',
        'ServiceUnavailable',
        'RequestTimeout',
        'InternalServerError',
      ].includes(error.name)
    )
      return { mutationId: mutation.id, status: 'retry' };
    const conflict =
      error instanceof Error &&
      (/conflict|stale/i.test(error.message) ||
        ['TransactionCanceledException', 'ConditionalCheckFailedException'].includes(error.name));
    return { mutationId: mutation.id, status: conflict ? 'conflict' : 'rejected' };
  }
}

export function projectionDigest(records: readonly FinanceProjection[]) {
  return createHash('sha256').update(JSON.stringify(records)).digest('hex');
}

export function financeSnapshotToken(actor: FinanceActor, version: number) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        version,
        id: actor.id,
        role: actor.role,
        active: actor.active,
        groups: [...actor.groupMemberships].sort((a, b) => a.groupId.localeCompare(b.groupId)),
      }),
    )
    .digest('hex');
}
