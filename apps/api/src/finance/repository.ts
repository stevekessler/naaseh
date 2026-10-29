import { TransactWriteCommand, type TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type {
  EntityRevision,
  FinanceScope,
  StableMutationResult,
  SyncChange,
  Task,
  TaskRevision,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  feedTransactionItems,
  buildTaskTransaction,
  getRecord,
  type GenericCurrentRecord,
} from '../shared/store.js';
import type { PreparedFeedChange } from '../sync/change-feed-repository.js';
import { authorizeFinanceScope, type FinanceActor } from './authorization.js';

const pad = (value: number, width: number) => String(value).padStart(width, '0');
const prefixFor = (entityType: string) => `FINANCE#${entityType.toUpperCase()}`;

export const financeKeys = {
  current: (entityType: string, entityId: string) => ({
    PK: `${prefixFor(entityType)}#${entityId}`,
    SK: 'CURRENT' as const,
  }),
  revision: (entityType: string, entityId: string, version: number, revisionId: string) => ({
    PK: `${prefixFor(entityType)}#${entityId}`,
    SK: `REV#${pad(version, 12)}#${revisionId}`,
  }),
  mutationReceipt: (actorId: string, mutationId: string) => ({
    PK: `USER#${actorId}`,
    SK: `FINANCE#MUTATION#${mutationId}`,
  }),
  sourceIdentity: (connectionId: string, accountId: string, sourceId: string) => ({
    PK: `FINANCE#SOURCE#${connectionId}#${accountId}`,
    SK: `IDENTITY#${sourceId}`,
  }),
  scopeIndex: (scope: FinanceScope, entityType: string, sortValue: string, entityId: string) => ({
    GSI1PK:
      scope.type === 'owner' ? `FINANCE#OWNER#${scope.ownerId}` : `FINANCE#GROUP#${scope.groupId}`,
    GSI1SK: `${entityType.toUpperCase()}#${sortValue}#${entityId}`,
  }),
  accountDateIndex: (accountId: string, occurredAt: string, entityId: string) => ({
    GSI2PK: `FINANCE#ACCOUNT#${accountId}`,
    GSI2SK: `${occurredAt}#${entityId}`,
  }),
  balanceSnapshot: (accountId: string, snapshotId: string) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `BALANCE#${snapshotId}`,
  }),
  csvBatch: (accountId: string, batchId: string) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `CSV#${batchId}`,
  }),
  csvRowReceipt: (accountId: string, batchId: string, ordinal: number) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `CSV#${batchId}#ROW#${pad(ordinal, 7)}`,
  }),
  connection: (connectionId: string) => ({
    PK: `FINANCE#CONNECTION#${connectionId}`,
    SK: 'CURRENT' as const,
  }),
  importJob: (connectionId: string, jobId: string) => ({
    PK: `FINANCE#CONNECTION#${connectionId}`,
    SK: `IMPORT#${jobId}`,
  }),
  transaction: (accountId: string, occurredAt: string, transactionId: string) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `TXN#${occurredAt}#${transactionId}`,
  }),
  transfer: (accountId: string, transferId: string) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `TRANSFER#${transferId}`,
  }),
  reviewIssue: (accountId: string, issueId: string) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `REVIEW#${issueId}`,
  }),
  transactionAlias: (transactionId: string) => ({
    PK: `FINANCE#TRANSACTION#${transactionId}`,
    SK: 'ALIAS' as const,
  }),
  keptSeparatePair: (accountId: string, pairKey: string) => ({
    PK: `FINANCE#ACCOUNT#${accountId}`,
    SK: `KEEP_SEPARATE#${pairKey}`,
  }),
  categoryNameLock: (canonicalName: string) => ({
    PK: 'FINANCE#CATEGORY#LOCK',
    SK: `NAME#${canonicalName}`,
  }),
  merchantKeyLock: (canonicalKey: string) => ({
    PK: 'FINANCE#MERCHANT#LOCK',
    SK: `KEY#${canonicalKey}`,
  }),
  budget: (budgetId: string) => ({
    PK: `FINANCE#BUDGET#${budgetId}`,
    SK: 'CURRENT' as const,
  }),
  budgetAccountLink: (budgetId: string, linkId: string) => ({
    PK: `FINANCE#BUDGET#${budgetId}`,
    SK: `ACCOUNT#${linkId}`,
  }),
  budgetItem: (budgetId: string, itemId: string) => ({
    PK: `FINANCE#BUDGET#${budgetId}`,
    SK: `ITEM#${itemId}`,
  }),
  budgetReconciliation: (budgetId: string, reconciledAt: string, reconciliationId: string) => ({
    PK: `FINANCE#BUDGET#${budgetId}`,
    SK: `RECON#${reconciledAt}#${reconciliationId}`,
  }),
  financialTaskLink: (budgetId: string, linkId: string) => ({
    PK: `FINANCE#BUDGET#${budgetId}`,
    SK: `TASK_LINK#${linkId}`,
  }),
  reusableItem: (reusableItemId: string) => ({
    PK: `FINANCE#REUSABLE_ITEM#${reusableItemId}`,
    SK: 'CURRENT' as const,
  }),
  reusableOccurrence: (reusableItemId: string, occurrenceDate: string, budgetId: string) => ({
    PK: `FINANCE#REUSABLE_ITEM#${reusableItemId}`,
    SK: `OCCURRENCE#${occurrenceDate}#${budgetId}`,
  }),
  transactionMatch: (transactionId: string, matchId: string) => ({
    PK: `FINANCE#TRANSACTION#${transactionId}`,
    SK: `MATCH#${matchId}`,
  }),
} as const;

interface CursorPayload {
  partition: string;
  sort: string;
}

export function encodeFinanceCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeFinanceCursor(cursor: string): CursorPayload {
  if (!cursor || cursor.length > 512) throw new Error('Invalid Finance cursor.');
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    if (!parsed.partition || !parsed.sort) throw new Error('missing cursor fields');
    return parsed;
  } catch {
    throw new Error('Invalid Finance cursor.');
  }
}

export function boundedFinanceLimit(value: number | undefined, maximum = 200): number {
  if (value === undefined) return Math.min(50, maximum);
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`Finance page limit must be between 1 and ${maximum}.`);
  }
  return value;
}

export interface FinanceMutationTransaction<T> {
  entityType: string;
  entityId: string;
  value: T;
  version: number;
  expectedVersion: number;
  revision: EntityRevision;
  actorId: string;
  mutationResult: StableMutationResult;
  indexes?: Record<string, unknown>;
  feedChanges?: readonly PreparedFeedChange[];
  additionalWrites?: NonNullable<TransactWriteCommandInput['TransactItems']>;
}

export function buildFinanceMutationTransaction<T>(
  input: FinanceMutationTransaction<T>,
): TransactWriteCommandInput {
  const current: GenericCurrentRecord<T> = {
    ...financeKeys.current(input.entityType, input.entityId),
    ...(input.indexes ?? {}),
    data: input.value,
    version: input.version,
  };
  const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
    {
      Put: {
        TableName: tableName,
        Item: current,
        ConditionExpression: 'attribute_not_exists(PK) OR #version = :expected',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':expected': input.expectedVersion },
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: {
          ...financeKeys.revision(
            input.entityType,
            input.entityId,
            input.version,
            input.revision.id,
          ),
          data: input.revision,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    {
      Put: {
        TableName: tableName,
        Item: {
          ...financeKeys.mutationReceipt(input.actorId, input.mutationResult.mutationId),
          data: input.mutationResult,
          expiresAt: Math.floor(Date.now() / 1_000) + 2_592_000,
        },
        ConditionExpression: 'attribute_not_exists(PK)',
      },
    },
    ...feedTransactionItems([...(input.feedChanges ?? [])]),
    ...(input.additionalWrites ?? []),
  ];
  if (items.length > 100) throw new Error('Finance mutation exceeds the transaction limit.');
  return { TransactItems: items };
}

export async function commitFinanceMutation<T>(input: FinanceMutationTransaction<T>) {
  await dynamodb.send(new TransactWriteCommand(buildFinanceMutationTransaction(input)));
}

export async function findFinanceRecord<T>(entityType: string, entityId: string) {
  const key = financeKeys.current(entityType, entityId);
  return (await getRecord<{ data: T }>(key.PK, key.SK))?.data;
}

/** Server-only authorization evidence, excluded from API and sync projections. */
export type StoredFinanceReconciliation = import('@naaseh/domain').ReconciliationRecord & {
  readonly sourceAccountIds?: readonly string[];
};

type FinancePersistenceInput = {
  account?: Record<string, unknown> & { id: string };
  snapshot?: Record<string, unknown> & { id: string; accountId: string };
  csvBatch?: Record<string, unknown> & { id: string; accountId: string };
  csvRowReceipt?: Record<string, unknown> & { accountId: string; batchId: string; ordinal: number };
  connection?: Record<string, unknown> & { id: string; encryptedAccessUrl: string };
  sourceIdentity?: { connectionId: string; sourceId: string; entityId: string };
  importJob?: Record<string, unknown> & { id: string; connectionId: string };
  transaction?: import('@naaseh/domain').FinancialTransaction;
  transfer?: import('@naaseh/domain').FinanceTransfer & { accountId: string };
  category?: import('@naaseh/domain').FinanceCategory;
  merchant?: import('@naaseh/domain').FinanceMerchant;
  reviewIssue?: import('@naaseh/domain').ImportReviewIssue;
  transactionAlias?: { fromTransactionId: string; toTransactionId: string };
  keptSeparatePair?: { accountId: string; pairKey: string; decidedBy: string; decidedAt: string };
  budget?: import('@naaseh/domain').Budget;
  budgetAccountLink?: import('@naaseh/domain').BudgetAccountLink;
  budgetItem?: import('@naaseh/domain').BudgetItem;
  reconciliation?: StoredFinanceReconciliation;
  financialTaskLink?: import('@naaseh/domain').FinancialTaskLink;
  reusableItem?: import('@naaseh/domain').ReusableBudgetItem;
  reusableOccurrence?: {
    reusableItemId: string;
    occurrenceDate: string;
    budgetId: string;
    budgetItemId: string;
  };
  transactionMatch?: import('@naaseh/domain').TransactionMatch;
};

/**
 * Builds collision-safe immutable records for a US1 persistence transaction. Credentials are
 * accepted only as KMS ciphertext so plaintext Access URLs cannot enter the table adapter.
 */
export function buildFinancePersistenceItems(input: FinancePersistenceInput) {
  const records: Array<{ key: { PK: string; SK: string }; data: unknown }> = [];
  if (input.account)
    records.push({ key: financeKeys.current('account', input.account.id), data: input.account });
  if (input.snapshot)
    records.push({
      key: financeKeys.balanceSnapshot(input.snapshot.accountId, input.snapshot.id),
      data: input.snapshot,
    });
  if (input.csvBatch)
    records.push({
      key: financeKeys.csvBatch(input.csvBatch.accountId, input.csvBatch.id),
      data: input.csvBatch,
    });
  if (input.csvRowReceipt)
    records.push({
      key: financeKeys.csvRowReceipt(
        input.csvRowReceipt.accountId,
        input.csvRowReceipt.batchId,
        input.csvRowReceipt.ordinal,
      ),
      data: input.csvRowReceipt,
    });
  if (input.connection)
    records.push({ key: financeKeys.connection(input.connection.id), data: input.connection });
  if (input.sourceIdentity)
    records.push({
      key: financeKeys.sourceIdentity(
        input.sourceIdentity.connectionId,
        input.sourceIdentity.entityId,
        input.sourceIdentity.sourceId,
      ),
      data: input.sourceIdentity,
    });
  if (input.importJob)
    records.push({
      key: financeKeys.importJob(input.importJob.connectionId, input.importJob.id),
      data: input.importJob,
    });
  if (input.transaction)
    records.push({
      key: financeKeys.transaction(
        input.transaction.accountId,
        input.transaction.effectiveAt,
        input.transaction.id,
      ),
      data: input.transaction,
    });
  if (input.transfer)
    records.push({
      key: financeKeys.transfer(input.transfer.accountId, input.transfer.id),
      data: input.transfer,
    });
  if (input.category)
    records.push({ key: financeKeys.current('category', input.category.id), data: input.category });
  if (input.merchant)
    records.push({ key: financeKeys.current('merchant', input.merchant.id), data: input.merchant });
  if (input.reviewIssue)
    records.push({
      key: financeKeys.reviewIssue(input.reviewIssue.accountId, input.reviewIssue.id),
      data: input.reviewIssue,
    });
  if (input.transactionAlias)
    records.push({
      key: financeKeys.transactionAlias(input.transactionAlias.fromTransactionId),
      data: input.transactionAlias,
    });
  if (input.keptSeparatePair)
    records.push({
      key: financeKeys.keptSeparatePair(
        input.keptSeparatePair.accountId,
        input.keptSeparatePair.pairKey,
      ),
      data: input.keptSeparatePair,
    });
  if (input.budget) records.push({ key: financeKeys.budget(input.budget.id), data: input.budget });
  if (input.budgetAccountLink)
    records.push({
      key: financeKeys.budgetAccountLink(
        input.budgetAccountLink.budgetId,
        input.budgetAccountLink.id,
      ),
      data: input.budgetAccountLink,
    });
  if (input.budgetItem)
    records.push({
      key: financeKeys.budgetItem(input.budgetItem.budgetId, input.budgetItem.id),
      data: input.budgetItem,
    });
  if (input.reconciliation)
    records.push({
      key: financeKeys.budgetReconciliation(
        input.reconciliation.budgetId,
        input.reconciliation.reconciledAt,
        input.reconciliation.id,
      ),
      data: input.reconciliation,
    });
  if (input.financialTaskLink)
    records.push({
      key: financeKeys.financialTaskLink(
        input.financialTaskLink.budgetId,
        input.financialTaskLink.id,
      ),
      data: input.financialTaskLink,
    });
  if (input.reusableItem)
    records.push({
      key: financeKeys.reusableItem(input.reusableItem.id),
      data: input.reusableItem,
    });
  if (input.reusableOccurrence)
    records.push({
      key: financeKeys.reusableOccurrence(
        input.reusableOccurrence.reusableItemId,
        input.reusableOccurrence.occurrenceDate,
        input.reusableOccurrence.budgetId,
      ),
      data: input.reusableOccurrence,
    });
  if (input.transactionMatch)
    records.push({
      key: financeKeys.transactionMatch(
        input.transactionMatch.transactionId,
        input.transactionMatch.id,
      ),
      data: input.transactionMatch,
    });
  return records.map(({ key, data }) => ({
    Put: {
      TableName: tableName,
      Item: { ...key, data },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  }));
}

export async function commitFinancePersistence(input: FinancePersistenceInput) {
  const items = buildFinancePersistenceItems(input);
  if (!items.length) throw new Error('Finance persistence transaction is empty.');
  await dynamodb.send(new TransactWriteCommand({ TransactItems: items }));
}

/** One conditional write appends immutable evidence while advancing only the reviewed budget version. */
export function buildBudgetReconciliationTransaction(input: {
  record: StoredFinanceReconciliation;
  budget: import('@naaseh/domain').Budget;
  expectedBudgetVersion: number;
}): TransactWriteCommandInput {
  return {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: {
            ...financeKeys.budgetReconciliation(
              input.record.budgetId,
              input.record.reconciledAt,
              input.record.id,
            ),
            data: input.record,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...financeKeys.budget(input.budget.id),
            data: input.budget,
            version: input.budget.version,
          },
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.expectedBudgetVersion },
        },
      },
    ],
  };
}

export function buildFinancialTaskLinkWrite(
  link: import('@naaseh/domain').FinancialTaskLink,
): NonNullable<TransactWriteCommandInput['TransactItems']>[number] {
  return {
    Put: {
      TableName: tableName,
      Item: {
        ...financeKeys.financialTaskLink(link.budgetId, link.id),
        data: link,
        version: link.version,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  };
}

/** One DynamoDB transaction creates the ordinary task and the Finance-only relationship. */
export function buildFinancialTaskCreationTransaction(input: {
  task: Task;
  revision: TaskRevision;
  mutationId: string;
  link: import('@naaseh/domain').FinancialTaskLink;
  feedChanges: PreparedFeedChange[];
}): TransactWriteCommandInput {
  const taskFeed = input.feedChanges.find(({ change }) => change.entityType === 'task');
  const financeFeed = input.feedChanges.find(
    ({ change }) => change.entityType === 'financeTaskLink',
  );
  if (taskFeed && JSON.stringify(taskFeed.change.payload).includes(input.link.budgetItemId)) {
    throw new Error('Task feeds cannot contain Finance relationship metadata.');
  }
  if (financeFeed && financeFeed.change.audience !== input.link.financeAudience) {
    throw new Error('Financial task links must use their Finance audience.');
  }
  const transaction = buildTaskTransaction(
    input.task,
    input.revision,
    input.mutationId,
    input.feedChanges,
    [buildFinancialTaskLinkWrite(input.link)],
  );
  transaction.TransactItems?.push({
    Put: {
      TableName: tableName,
      Item: {
        ...financeKeys.mutationReceipt(input.task.ownerId, input.mutationId),
        data: {
          mutationId: input.mutationId,
          status: 'applied',
          entityVersion: input.link.version,
          entity: {
            taskId: input.task.id,
            financialTaskLinkId: input.link.id,
          },
        },
        expiresAt: Math.floor(Date.now() / 1_000) + 2_592_000,
      },
      ConditionExpression: 'attribute_not_exists(PK)',
    },
  });
  return transaction;
}

export function financeFeedChange(input: {
  audience: string;
  entityType: NonNullable<SyncChange['entityType']>;
  entityId: string;
  version: number;
  changedAt: string;
  payload?: unknown;
  operation?: 'upsert' | 'tombstone';
}): Omit<SyncChange, 'sequence'> {
  return {
    audience: input.audience,
    entityType: input.entityType,
    entityId: input.entityId,
    version: input.version,
    changedAt: input.changedAt,
    operation: input.operation ?? 'upsert',
    ...(input.payload === undefined ? {} : { payload: input.payload }),
  };
}

export function listFinanceTransactionPage(
  repository: FinanceMemoryRepository,
  accountId: string,
  input: { limit?: number; cursor?: string } = {},
) {
  const limit = boundedFinanceLimit(input.limit);
  const ordered = repository.transactions
    .filter((transaction) => transaction.accountId === accountId)
    .sort(
      (left, right) =>
        right.effectiveAt.localeCompare(left.effectiveAt) || right.id.localeCompare(left.id),
    );
  let start = 0;
  if (input.cursor) {
    const cursor = decodeFinanceCursor(input.cursor);
    if (cursor.partition !== accountId) throw new Error('Invalid Finance cursor.');
    const index = ordered.findIndex(
      (transaction) => `${transaction.effectiveAt}#${transaction.id}` === cursor.sort,
    );
    if (index < 0) throw new Error('Invalid Finance cursor.');
    start = index + 1;
  }
  const items = ordered.slice(start, start + limit);
  const last = items.at(-1);
  const cursor =
    last && start + items.length < ordered.length
      ? encodeFinanceCursor({ partition: accountId, sort: `${last.effectiveAt}#${last.id}` })
      : null;
  return { items, cursor };
}

export function claimFinanceCategoryName(
  repository: FinanceMemoryRepository,
  canonicalName: string,
  categoryId: string,
) {
  const current = repository.categoryNameLocks.get(canonicalName);
  if (current && current !== categoryId) throw new Error('Finance category name conflict.');
  repository.categoryNameLocks.set(canonicalName, categoryId);
}

export function claimFinanceMerchantKey(
  repository: FinanceMemoryRepository,
  canonicalKey: string,
  merchantId: string,
) {
  const current = repository.merchantKeyLocks.get(canonicalKey);
  if (current && current !== merchantId) throw new Error('Finance merchant key conflict.');
  repository.merchantKeyLocks.set(canonicalKey, merchantId);
}

/** Deterministic repository used by service tests and local/offline adapters. */
export class FinanceMemoryRepository {
  readonly tasks = new Map<string, import('@naaseh/domain').Task>();
  readonly accounts = new Map<string, import('@naaseh/domain').FinancialAccount>();
  readonly balanceSnapshots: import('@naaseh/domain').BalanceSnapshot[] = [];
  readonly transactions: import('@naaseh/domain').FinancialTransaction[] = [];
  readonly transfers = new Map<string, import('@naaseh/domain').FinanceTransfer>();
  readonly categories = new Map<string, import('@naaseh/domain').FinanceCategory>();
  readonly merchants = new Map<string, import('@naaseh/domain').FinanceMerchant>();
  readonly budgets = new Map<string, import('@naaseh/domain').Budget>();
  readonly budgetAccountLinks = new Map<string, import('@naaseh/domain').BudgetAccountLink>();
  readonly budgetItems = new Map<string, import('@naaseh/domain').BudgetItem>();
  readonly budgetReconciliations: StoredFinanceReconciliation[] = [];
  readonly financialTaskLinks = new Map<string, import('@naaseh/domain').FinancialTaskLink>();
  readonly reusableItems = new Map<string, import('@naaseh/domain').ReusableBudgetItem>();
  readonly reusableOccurrenceLocks = new Map<string, string>();
  readonly transactionMatches = new Map<string, import('@naaseh/domain').TransactionMatch>();
  readonly reviewIssues = new Map<string, import('@naaseh/domain').ImportReviewIssue>();
  readonly transactionAliases = new Map<string, string>();
  readonly keptSeparatePairs = new Set<string>();
  readonly categoryNameLocks = new Map<string, string>();
  readonly merchantKeyLocks = new Map<string, string>();
  readonly csvBatches = new Map<string, unknown>();
  readonly csvFileReceipts = new Map<string, string>();
  readonly csvRowReceipts = new Map<string, 'committed' | 'failed' | 'excluded'>();
  readonly sourceIdentities = new Map<string, string>();
  readonly connections = new Map<string, Record<string, unknown>>();
  readonly importJobs = new Map<
    string,
    import('@naaseh/domain').ImportJob & { leaseUntil?: string }
  >();
  readonly pendingSimplefinAccounts = new Map<string, Record<string, unknown>>();
  readonly deletionPreviews = new Map<string, import('./deletion-service.js').DeletionPreview>();
  readonly feedChanges: Array<Omit<SyncChange, 'sequence'>> = [];
  readonly mutationReceipts = new Map<string, unknown>();

  mutation<T>(actor: string | FinanceActor, mutationId: string): T | undefined {
    const actorId = typeof actor === 'string' ? actor : actor.id;
    const receipt = this.mutationReceipts.get(`${actorId}:${mutationId}`);
    if (receipt !== undefined && typeof actor !== 'string') {
      this.assertReceiptAccess(actor, receipt);
    }
    return receipt as T | undefined;
  }

  private assertReceiptAccess(actor: FinanceActor, value: unknown): void {
    const deny = () => {
      throw new Error('Finance record not found.');
    };
    if (!actor.active) deny();
    if (Array.isArray(value)) {
      for (const item of value) this.assertReceiptAccess(actor, item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    const accountAccess = (id: string) => {
      const account = this.accounts.get(id);
      if (!account || !authorizeFinanceScope(actor, account.scope, 'read').allowed) deny();
    };
    const budgetAccess = (id: string) => {
      const budget = this.budgets.get(id);
      if (
        !budget ||
        !authorizeFinanceScope(actor, { type: 'group', groupId: budget.groupId }, 'read').allowed
      )
        deny();
    };
    if (typeof record.id === 'string') {
      const account = this.accounts.get(record.id);
      const budget = this.budgets.get(record.id);
      const reusable = this.reusableItems.get(record.id);
      const transfer = this.transfers.get(record.id);
      if (record.scope) {
        const scope = account?.scope ?? transfer?.scope;
        if (!scope || !authorizeFinanceScope(actor, scope, 'read').allowed) deny();
      }
      if (budget) budgetAccess(budget.id);
      if (
        reusable &&
        !authorizeFinanceScope(actor, { type: 'group', groupId: reusable.groupId }, 'read').allowed
      )
        deny();
    }
    if (
      typeof record.groupId === 'string' &&
      !authorizeFinanceScope(actor, { type: 'group', groupId: record.groupId }, 'read').allowed
    )
      deny();
    if (typeof record.accountId === 'string') accountAccess(record.accountId);
    if (typeof record.budgetId === 'string') budgetAccess(record.budgetId);
    if (typeof record.budgetItemId === 'string') {
      const item = this.budgetItems.get(record.budgetItemId);
      if (!item) deny();
      else {
        budgetAccess(item.budgetId);
        for (const id of item.relatedAccountIds) accountAccess(id);
      }
    }
    if (typeof record.transactionId === 'string') {
      const transaction = this.transactions.find(
        ({ id }) => id === this.resolveTransactionId(String(record.transactionId)),
      );
      if (!transaction) deny();
      else accountAccess(transaction.accountId);
    }
    if (typeof record.connectionId === 'string') {
      const connection = this.connections.get(record.connectionId) as
        | { scope?: FinanceScope }
        | undefined;
      if (!connection?.scope || !authorizeFinanceScope(actor, connection.scope, 'read').allowed)
        deny();
    }
    for (const field of ['relatedAccountIds', 'sourceAccountIds']) {
      if (Array.isArray(record[field])) for (const id of record[field]) accountAccess(String(id));
    }
    if (Array.isArray(record.legTransactionIds))
      for (const id of record.legTransactionIds) {
        this.assertReceiptAccess(actor, { transactionId: id });
      }
    for (const field of ['account', 'snapshot', 'link']) {
      if (record[field]) this.assertReceiptAccess(actor, record[field]);
    }
  }
  remember<T>(actorId: string, mutationId: string, result: T): T {
    this.mutationReceipts.set(`${actorId}:${mutationId}`, result);
    return result;
  }
  claimSourceIdentity(connectionId: string, sourceId: string, entityId: string): void {
    const key = `${connectionId}:${sourceId}`;
    const existing = this.sourceIdentities.get(key);
    if (existing && existing !== entityId)
      throw new Error('Finance source identity is already claimed.');
    this.sourceIdentities.set(key, entityId);
  }
  transferSourceIdentity(
    connectionId: string,
    sourceId: string,
    fromEntityId: string,
    toEntityId: string,
  ): void {
    const key = `${connectionId}:${sourceId}`;
    if (this.sourceIdentities.get(key) !== fromEntityId)
      throw new Error('Finance source identity version conflict.');
    this.sourceIdentities.set(key, toEntityId);
  }
  resolveTransactionId(transactionId: string): string {
    let current = transactionId;
    const seen = new Set<string>();
    while (this.transactionAliases.has(current)) {
      if (seen.has(current)) throw new Error('Finance transaction alias cycle.');
      seen.add(current);
      current = this.transactionAliases.get(current)!;
    }
    return current;
  }
}

/**
 * Returns only the aggregate sources a viewer may inspect. Hidden account links are represented
 * solely by totalsComplete=false so neither their identity nor their contribution can escape.
 */
export function budgetAggregateSourceForViewer(
  repository: FinanceMemoryRepository,
  budgetId: string,
  visibleAccountIds: readonly string[],
) {
  const visible = new Set(visibleAccountIds);
  const allLinks = [...repository.budgetAccountLinks.values()].filter(
    (link) => link.budgetId === budgetId && link.status === 'active',
  );
  const links = allLinks.filter((link) => visible.has(link.accountId));
  const linkedAccountIds = new Set(links.map(({ accountId }) => accountId));
  const items = [...repository.budgetItems.values()].filter(
    (item) =>
      item.budgetId === budgetId &&
      item.status === 'active' &&
      item.relatedAccountIds.every((accountId) => linkedAccountIds.has(accountId)),
  );
  const itemIds = new Set(items.map(({ id }) => id));
  const transactions = repository.transactions.filter(
    (transaction) =>
      linkedAccountIds.has(transaction.accountId) &&
      transaction.allocations.some(({ budgetItemId }) => budgetItemId && itemIds.has(budgetItemId)),
  );
  return {
    links,
    items,
    transactions,
    totalsComplete: links.length === allLinks.length,
  };
}
