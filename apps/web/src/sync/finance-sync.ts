import type { SyncChange } from '@naaseh/domain';
import { peekFinanceAccess } from '../features/finance/security/finance-access.js';
import { queueEncryptedBudgetMutation } from '../db/finance-repository.js';

export async function queueFinanceBudgetActivityChange<
  T extends { id: string; groupId: string; version: number },
>(input: { budget: T; activity: 'active' | 'inactive'; actorId: string; now?: Date }) {
  const changedAt = (input.now ?? new Date()).toISOString();
  return queueEncryptedBudgetMutation({
    entityId: input.budget.id,
    entityType: 'financeBudget',
    budgetId: input.budget.id,
    scopeKey: `GROUP#${input.budget.groupId}`,
    baseVersion: input.budget.version,
    operation: 'update',
    value: {
      ...input.budget,
      activity: input.activity,
      activityChangedAt: changedAt,
      activityChangedBy: input.actorId,
      version: input.budget.version + 1,
    },
    payloadValue: { activity: input.activity, expectedVersion: input.budget.version },
  });
}

/** Keep a complete replay attempt inside its original Finance visit, without stalling tasks. */
export async function readFinanceReplayIntent<T>(
  entityType: string,
  operation: (signal?: AbortSignal) => Promise<T>,
): Promise<T | undefined> {
  if (!entityType.startsWith('finance')) return operation();
  const access = peekFinanceAccess();
  if (!access?.canRead()) return undefined;
  try {
    // An offline-only visit never provides authority to replay connected mutations.
    if (access.requiresPin && !access.requestHeaders()['x-finance-unlock']) return undefined;
    return await access.read(operation);
  } catch (error) {
    if (!access.canRead()) return undefined;
    throw error;
  }
}

export interface FinanceSyncState {
  status: 'idle' | 'syncing' | 'offline' | 'conflict' | 'failed';
  pendingCount: number;
  lastSuccessfulAt?: string;
  safeMessage?: string;
}

export function financeSyncState(input: {
  online: boolean;
  syncing: boolean;
  pendingCount: number;
  conflicts: number;
  lastSuccessfulAt?: string;
  failed?: boolean;
}): FinanceSyncState {
  if (!input.online)
    return {
      status: 'offline',
      pendingCount: input.pendingCount,
      safeMessage: 'Changes are queued.',
    };
  if (input.conflicts)
    return {
      status: 'conflict',
      pendingCount: input.pendingCount,
      safeMessage: 'Review conflicting finance changes.',
    };
  if (input.failed)
    return {
      status: 'failed',
      pendingCount: input.pendingCount,
      safeMessage: 'Finance synchronization needs attention.',
    };
  return {
    status: input.syncing ? 'syncing' : 'idle',
    pendingCount: input.pendingCount,
    ...(input.lastSuccessfulAt ? { lastSuccessfulAt: input.lastSuccessfulAt } : {}),
  };
}

export function orderFinanceHydration(changes: readonly SyncChange[]) {
  const parentFirst = new Map([
    ['financeAccount', 0],
    ['financeCategory', 1],
    ['financeMerchant', 2],
    ['financeReusableItem', 3],
    ['financeBudget', 4],
    ['financeBudgetAccountLink', 5],
    ['financeBudgetItem', 6],
    ['financeTransaction', 7],
    ['financeAllocation', 8],
    ['financeUpcomingExpense', 9],
    ['financeFulfillment', 10],
    ['financeRefundRelationship', 11],
    ['financeTransactionMatch', 12],
    ['financeReconciliation', 13],
    ['financeTaskLink', 14],
  ]);
  return [...changes].sort(
    (a, b) =>
      (parentFirst.get(a.entityType ?? '') ?? 100) - (parentFirst.get(b.entityType ?? '') ?? 100) ||
      a.sequence - b.sequence,
  );
}

const budgetConflictFields = new Set([
  'name',
  'budgetDate',
  'startDate',
  'endDate',
  'status',
  'description',
  'merchantId',
  'financeCategoryId',
  'subcategoryId',
  'classification',
  'paymentType',
  'checkNumber',
  'plannedAmountMinor',
  'currency',
  'currencyExponent',
  'applicableDate',
  'relatedAccountIds',
  'accountId',
  'recurrence',
]);

export interface FinanceBudgetConflictField {
  field: string;
  local: unknown;
  current: unknown;
}

/**
 * Builds a semantic review from two already-authorized projections. Identifiers and server-only
 * metadata are deliberately excluded so conflict UI cannot disclose another account audience.
 */
export function financeBudgetConflictReview(
  local: Record<string, unknown>,
  current: Record<string, unknown>,
) {
  const fields: FinanceBudgetConflictField[] = [];
  for (const field of budgetConflictFields) {
    if (JSON.stringify(local[field]) !== JSON.stringify(current[field])) {
      fields.push({ field, local: local[field], current: current[field] });
    }
  }
  return {
    fields,
    resolutions: ['keep-mine', 'use-current', 'review-later'] as const,
    requiresOnlineRefresh: fields.some(({ field }) => field === 'accountId'),
  };
}
