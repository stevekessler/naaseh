import type { ExpenseFulfillment } from '@naaseh/domain';
import type { UpcomingExpense } from '@naaseh/domain';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { tableName } from '../shared/dynamodb.js';
import type { FinanceMemoryRepository } from './repository.js';

export const upcomingExpenseKey = (expenseId: string) => ({
  PK: `FINANCE#UPCOMING#${expenseId}`,
  SK: 'CURRENT',
});
export const upcomingExpenseHistoryKey = (expenseId: string, version: number) => ({
  PK: `FINANCE#UPCOMING#${expenseId}`,
  SK: `HISTORY#${String(version).padStart(12, '0')}`,
});
export const upcomingExpenseAccountIndexKey = (
  accountId: string,
  dueDate: string,
  expenseId: string,
) => ({ PK: `FINANCE#UPCOMING#ACCOUNT#${accountId}`, SK: `DUE#${dueDate}#${expenseId}` });
export const upcomingExpenseDueIndexKey = (
  groupId: string,
  dueDate: string,
  expenseId: string,
) => ({ PK: `FINANCE#UPCOMING#GROUP#${groupId}`, SK: `DUE#${dueDate}#${expenseId}` });
export const upcomingExpensePlannedSourceKey = (identity: string) => ({
  PK: 'FINANCE#UPCOMING#PLANNED_SOURCE',
  SK: identity,
});
export const expenseFulfillmentKey = (expenseId: string, fulfillmentId: string) => ({
  PK: `FINANCE#UPCOMING#${expenseId}`,
  SK: `FULFILLMENT#${fulfillmentId}`,
});
export const fulfillmentClaimLedgerKey = (transactionId: string) => ({
  PK: `FINANCE#TRANSACTION#${transactionId}`,
  SK: 'FULFILLMENT_CLAIM_LEDGER',
});

const putNew = (Item: Record<string, unknown>) => ({
  Put: { TableName: tableName, Item, ConditionExpression: 'attribute_not_exists(PK)' },
});

/** Canonical create: body, both bounded indexes, immutable v1 history and source uniqueness. */
export function buildUpcomingExpenseCreateTransaction(input: {
  expense: UpcomingExpense;
  plannedSourceIdentity?: string;
  mutationReceipt: { actorId: string; mutationId: string; fingerprint: string };
}): TransactWriteCommandInput {
  const { expense } = input;
  const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
    putNew({ ...upcomingExpenseKey(expense.id), version: expense.version, data: expense }),
    putNew({
      ...upcomingExpenseAccountIndexKey(expense.accountId, expense.dueDate, expense.id),
      expenseId: expense.id,
      version: expense.version,
    }),
    putNew({
      ...upcomingExpenseDueIndexKey(expense.groupId, expense.dueDate, expense.id),
      expenseId: expense.id,
      version: expense.version,
    }),
    putNew({
      ...upcomingExpenseHistoryKey(expense.id, expense.version),
      version: expense.version,
      data: expense,
    }),
    putNew({
      PK: `FINANCE#MUTATION#${input.mutationReceipt.actorId}`,
      SK: input.mutationReceipt.mutationId,
      fingerprint: input.mutationReceipt.fingerprint,
      expenseId: expense.id,
      version: expense.version,
    }),
  ];
  if (input.plannedSourceIdentity)
    items.push(
      putNew({
        ...upcomingExpensePlannedSourceKey(input.plannedSourceIdentity),
        expenseId: expense.id,
        version: 1,
      }),
    );
  return { TransactItems: items };
}

function sameKey(left: { PK: string; SK: string }, right: { PK: string; SK: string }) {
  return left.PK === right.PK && left.SK === right.SK;
}

const deleteOwnedIndex = (Key: { PK: string; SK: string }, expenseId: string) => ({
  Delete: {
    TableName: tableName,
    Key,
    ConditionExpression: 'expenseId = :expenseId',
    ExpressionAttributeValues: { ':expenseId': expenseId },
  },
});

/**
 * Canonical update/reschedule/cancel/reopen write. Index membership follows active lifecycle,
 * while source identity remains reserved until it is explicitly replaced or removed.
 */
export function buildUpcomingExpenseUpdateTransaction(input: {
  before: UpcomingExpense;
  after: UpcomingExpense;
  previousPlannedSourceIdentity?: string;
  nextPlannedSourceIdentity?: string;
  mutationReceipt: { actorId: string; mutationId: string; fingerprint: string };
}): TransactWriteCommandInput {
  if (input.after.id !== input.before.id || input.after.version !== input.before.version + 1)
    throw new Error('Upcoming expense update must advance one canonical version.');
  const oldAccountIndex = upcomingExpenseAccountIndexKey(
    input.before.accountId,
    input.before.dueDate,
    input.before.id,
  );
  const nextAccountIndex = upcomingExpenseAccountIndexKey(
    input.after.accountId,
    input.after.dueDate,
    input.after.id,
  );
  const oldDueIndex = upcomingExpenseDueIndexKey(
    input.before.groupId,
    input.before.dueDate,
    input.before.id,
  );
  const nextDueIndex = upcomingExpenseDueIndexKey(
    input.after.groupId,
    input.after.dueDate,
    input.after.id,
  );
  const items: NonNullable<TransactWriteCommandInput['TransactItems']> = [
    {
      Put: {
        TableName: tableName,
        Item: {
          ...upcomingExpenseKey(input.after.id),
          version: input.after.version,
          data: input.after,
        },
        ConditionExpression: '#version = :expected',
        ExpressionAttributeNames: { '#version': 'version' },
        ExpressionAttributeValues: { ':expected': input.before.version },
      },
    },
  ];
  if (input.before.lifecycle === 'active' && !sameKey(oldAccountIndex, nextAccountIndex))
    items.push(deleteOwnedIndex(oldAccountIndex, input.before.id));
  if (input.before.lifecycle === 'active' && !sameKey(oldDueIndex, nextDueIndex))
    items.push(deleteOwnedIndex(oldDueIndex, input.before.id));
  if (
    input.after.lifecycle === 'active' &&
    (input.before.lifecycle !== 'active' || !sameKey(oldAccountIndex, nextAccountIndex))
  )
    items.push(
      putNew({
        ...nextAccountIndex,
        expenseId: input.after.id,
        version: input.after.version,
      }),
    );
  if (
    input.after.lifecycle === 'active' &&
    (input.before.lifecycle !== 'active' || !sameKey(oldDueIndex, nextDueIndex))
  )
    items.push(
      putNew({
        ...nextDueIndex,
        expenseId: input.after.id,
        version: input.after.version,
      }),
    );
  if (input.before.lifecycle === 'active' && input.after.lifecycle !== 'active') {
    if (sameKey(oldAccountIndex, nextAccountIndex))
      items.push(deleteOwnedIndex(oldAccountIndex, input.before.id));
    if (sameKey(oldDueIndex, nextDueIndex))
      items.push(deleteOwnedIndex(oldDueIndex, input.before.id));
  }
  if (input.previousPlannedSourceIdentity !== input.nextPlannedSourceIdentity) {
    if (input.previousPlannedSourceIdentity)
      items.push({
        Delete: {
          TableName: tableName,
          Key: upcomingExpensePlannedSourceKey(input.previousPlannedSourceIdentity),
          ConditionExpression: 'expenseId = :expenseId',
          ExpressionAttributeValues: { ':expenseId': input.before.id },
        },
      });
    if (input.nextPlannedSourceIdentity)
      items.push(
        putNew({
          ...upcomingExpensePlannedSourceKey(input.nextPlannedSourceIdentity),
          expenseId: input.after.id,
          version: input.after.version,
        }),
      );
  }
  items.push(
    putNew({
      ...upcomingExpenseHistoryKey(input.after.id, input.after.version),
      version: input.after.version,
      data: input.after,
    }),
    putNew({
      PK: `FINANCE#MUTATION#${input.mutationReceipt.actorId}`,
      SK: input.mutationReceipt.mutationId,
      fingerprint: input.mutationReceipt.fingerprint,
      expenseId: input.after.id,
      version: input.after.version,
    }),
  );
  return { TransactItems: items };
}

/**
 * One claim commit conditions the current obligation, canonical transaction and claim ledger.
 * Awaiting-posting claims reserve ledger capacity exactly like posted claims.
 */
export function buildExpenseFulfillmentTransaction(input: {
  before: UpcomingExpense;
  after: UpcomingExpense;
  fulfillment: ExpenseFulfillment;
  transactionStorageKey: { PK: string; SK: string };
  expectedTransactionVersion: number;
  expectedClaimVersion: number;
  claimedMinorAfter: number;
}): TransactWriteCommandInput {
  if (input.after.version !== input.before.version + 1)
    throw new Error('Upcoming expense claim must advance exactly one version.');
  return {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: {
            ...upcomingExpenseKey(input.after.id),
            version: input.after.version,
            data: input.after,
          },
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.before.version },
        },
      },
      {
        ConditionCheck: {
          TableName: tableName,
          Key: input.transactionStorageKey,
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.expectedTransactionVersion },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...fulfillmentClaimLedgerKey(input.fulfillment.transactionId),
            version: input.expectedClaimVersion + 1,
            claimedMinor: input.claimedMinorAfter,
          },
          ConditionExpression:
            input.expectedClaimVersion === 0 ? 'attribute_not_exists(PK)' : '#version = :expected',
          ...(input.expectedClaimVersion === 0
            ? {}
            : {
                ExpressionAttributeNames: { '#version': 'version' },
                ExpressionAttributeValues: { ':expected': input.expectedClaimVersion },
              }),
        },
      },
      putNew({
        ...expenseFulfillmentKey(input.fulfillment.upcomingExpenseId, input.fulfillment.id),
        version: input.fulfillment.version,
        data: input.fulfillment,
      }),
      putNew({
        ...upcomingExpenseHistoryKey(input.after.id, input.after.version),
        version: input.after.version,
        data: input.after,
      }),
    ],
  };
}

/** Atomically release claim capacity while preserving the removed fulfillment as history. */
export function buildExpenseFulfillmentRemovalTransaction(input: {
  before: UpcomingExpense;
  after: UpcomingExpense;
  beforeFulfillment: ExpenseFulfillment;
  afterFulfillment: ExpenseFulfillment;
  transactionStorageKey: { PK: string; SK: string };
  expectedTransactionVersion: number;
  expectedClaimVersion: number;
  claimedMinorAfter: number;
}): TransactWriteCommandInput {
  if (
    input.after.id !== input.before.id ||
    input.after.version !== input.before.version + 1 ||
    input.afterFulfillment.id !== input.beforeFulfillment.id ||
    input.afterFulfillment.version !== input.beforeFulfillment.version + 1 ||
    input.afterFulfillment.status !== 'removed' ||
    input.afterFulfillment.transactionId !== input.beforeFulfillment.transactionId ||
    !Number.isSafeInteger(input.claimedMinorAfter) ||
    input.claimedMinorAfter < 0
  )
    throw new Error('Invalid upcoming expense fulfillment removal.');
  return {
    TransactItems: [
      {
        Put: {
          TableName: tableName,
          Item: {
            ...upcomingExpenseKey(input.after.id),
            version: input.after.version,
            data: input.after,
          },
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.before.version },
        },
      },
      {
        ConditionCheck: {
          TableName: tableName,
          Key: input.transactionStorageKey,
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.expectedTransactionVersion },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...fulfillmentClaimLedgerKey(input.afterFulfillment.transactionId),
            version: input.expectedClaimVersion + 1,
            claimedMinor: input.claimedMinorAfter,
          },
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.expectedClaimVersion },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...expenseFulfillmentKey(
              input.afterFulfillment.upcomingExpenseId,
              input.afterFulfillment.id,
            ),
            version: input.afterFulfillment.version,
            data: input.afterFulfillment,
          },
          ConditionExpression: '#version = :expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: { ':expected': input.beforeFulfillment.version },
        },
      },
      putNew({
        ...upcomingExpenseHistoryKey(input.after.id, input.after.version),
        version: input.after.version,
        data: input.after,
      }),
    ],
  };
}

export const fulfillmentsForExpense = (
  repository: FinanceMemoryRepository,
  upcomingExpenseId: string,
) =>
  [...repository.expenseFulfillments.values()].filter(
    (fulfillment) => fulfillment.upcomingExpenseId === upcomingExpenseId,
  );

export const fulfillmentsForTransaction = (
  repository: FinanceMemoryRepository,
  transactionId: string,
) =>
  [...repository.expenseFulfillments.values()].filter(
    (fulfillment) => fulfillment.transactionId === transactionId,
  );

export function storeExpenseFulfillment(
  repository: FinanceMemoryRepository,
  fulfillment: ExpenseFulfillment,
) {
  repository.expenseFulfillments.set(fulfillment.id, fulfillment);
}

/** Move every claim and its version fence when provider reconciliation chooses a canonical row. */
export function reconcileFulfillmentTransactionAlias(
  repository: FinanceMemoryRepository,
  fromTransactionId: string,
  toTransactionId: string,
) {
  if (fromTransactionId === toTransactionId) return;
  for (const [id, fulfillment] of repository.expenseFulfillments) {
    if (fulfillment.transactionId !== fromTransactionId) continue;
    repository.expenseFulfillments.set(id, {
      ...fulfillment,
      transactionId: toTransactionId,
      updatedAt: new Date().toISOString(),
      version: fulfillment.version + 1,
    });
  }
  const fromVersion = repository.fulfillmentClaimVersions.get(fromTransactionId);
  const toVersion = repository.fulfillmentClaimVersions.get(toTransactionId);
  if (fromVersion !== undefined && toVersion !== undefined)
    throw new Error('Canonical fulfillment claim ledgers require review.');
  if (fromVersion !== undefined) {
    repository.fulfillmentClaimVersions.delete(fromTransactionId);
    repository.fulfillmentClaimVersions.set(toTransactionId, fromVersion);
  }
}
