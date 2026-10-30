import type { Task } from '@naaseh/domain';
import { assertDeletionLedgerApplied } from './deletion-ledger-validator.js';

export const MAX_RPO_SECONDS = 5 * 60;
export const MAX_RTO_SECONDS = 4 * 60 * 60;
export const journalRestoreEntityNames = [
  'journalEntry',
  'journalProfile',
  'journalKeyEnvelope',
  'journalMutationReceipt',
  'journalFeedChange',
  'journalRecoveryRequest',
  'journalRecoveryAudit',
] as const;
export function validateJournalRestoreInventory(inventory: Record<string, number>) {
  const missing = journalRestoreEntityNames.filter(
    (name) => !Number.isSafeInteger(inventory[name]) || (inventory[name] ?? -1) < 0,
  );
  if (missing.length)
    throw new Error(`Journal restore inventory is incomplete: ${missing.join(', ')}`);
  return {
    records: journalRestoreEntityNames.reduce((total, name) => total + (inventory[name] ?? 0), 0),
  };
}

export type FinanceRestoreEntityType =
  | 'financeAccount'
  | 'financeBalanceSnapshot'
  | 'financeCsvImportBatch'
  | 'financeTransaction'
  | 'financeBudget'
  | 'financeBudgetAccountLink'
  | 'financeBudgetItem'
  | 'financeTaskLink'
  | 'financeReconciliation';

export interface FinanceRestoreRow {
  entityType: FinanceRestoreEntityType;
  id: string;
  data: Record<string, unknown>;
}

/**
 * Validates restored Finance relationships from isolated backup rows only. The validator has no
 * provider client or credential input, so restore testing cannot contact SimpleFIN by construction.
 */
export function validateFinanceRestore(rows: readonly FinanceRestoreRow[]) {
  const errors: string[] = [];
  const byType = new Map<FinanceRestoreEntityType, FinanceRestoreRow[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.entityType}:${row.id}`;
    if (seen.has(key)) errors.push(`Duplicate restored identity: ${key}.`);
    seen.add(key);
    const values = byType.get(row.entityType) ?? [];
    values.push(row);
    byType.set(row.entityType, values);
  }
  const ids = (type: FinanceRestoreEntityType) =>
    new Set((byType.get(type) ?? []).map(({ id }) => id));
  const accounts = ids('financeAccount');
  const batches = ids('financeCsvImportBatch');
  const transactions = ids('financeTransaction');
  const budgets = ids('financeBudget');
  const items = ids('financeBudgetItem');
  const requireReference = (
    row: FinanceRestoreRow,
    field: string,
    expected: ReadonlySet<string>,
    label: string,
  ) => {
    const value = row.data[field];
    if (typeof value !== 'string' || !expected.has(value)) {
      errors.push(`${row.entityType}:${row.id} has an invalid ${label} reference.`);
    }
  };

  for (const row of byType.get('financeBalanceSnapshot') ?? []) {
    requireReference(row, 'accountId', accounts, 'account');
  }
  for (const row of byType.get('financeCsvImportBatch') ?? []) {
    requireReference(row, 'accountId', accounts, 'account');
    if (typeof row.data.fileDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(row.data.fileDigest)) {
      errors.push(`financeCsvImportBatch:${row.id} has an invalid receipt digest.`);
    }
    if (!Array.isArray(row.data.committedOrdinals)) {
      errors.push(`financeCsvImportBatch:${row.id} has no committed-row receipt.`);
    }
  }
  for (const row of byType.get('financeTransaction') ?? []) {
    requireReference(row, 'accountId', accounts, 'account');
    const origin = row.data.origin;
    const hasEntry = isRestoreObject(row.data.entrySnapshot);
    const hasProvider = isRestoreObject(row.data.providerSnapshot);
    const hasProviderIdentity =
      typeof row.data.providerConnectionId === 'string' &&
      typeof row.data.providerAccountId === 'string' &&
      typeof row.data.sourceTransactionId === 'string';
    if ((origin === 'manual' || origin === 'csv') && !hasEntry) {
      errors.push(`financeTransaction:${row.id} is missing its entry snapshot.`);
    }
    if (origin === 'simplefin' && (!hasProvider || !hasProviderIdentity)) {
      errors.push(`financeTransaction:${row.id} is missing its provider source identity.`);
    }
    if (origin === 'csv') {
      requireReference(row, 'csvImportBatchId', batches, 'CSV batch');
      if (!Number.isSafeInteger(row.data.csvRowOrdinal)) {
        errors.push(`financeTransaction:${row.id} has an invalid CSV row receipt.`);
      }
    }
    if (row.data.reconciliationState === 'reconciled' && (!hasEntry || !hasProviderIdentity)) {
      errors.push(`financeTransaction:${row.id} lost reconciled source evidence.`);
    }
    const allocations = Array.isArray(row.data.allocations) ? row.data.allocations : [];
    if (allocations.length) {
      const total = allocations.reduce(
        (sum: number, allocation) =>
          sum +
          (isRestoreObject(allocation) && Number.isSafeInteger(allocation.amountMinor)
            ? Number(allocation.amountMinor)
            : Number.NaN),
        0,
      );
      if (!Number.isSafeInteger(row.data.amountMinor) || total !== row.data.amountMinor) {
        errors.push(`financeTransaction:${row.id} has unbalanced restored allocations.`);
      }
    }
  }
  for (const row of byType.get('financeBudgetAccountLink') ?? []) {
    requireReference(row, 'budgetId', budgets, 'budget');
    requireReference(row, 'accountId', accounts, 'account');
  }
  for (const row of byType.get('financeBudgetItem') ?? []) {
    requireReference(row, 'budgetId', budgets, 'budget');
  }
  for (const row of byType.get('financeTaskLink') ?? []) {
    requireReference(row, 'budgetItemId', items, 'budget item');
    if (typeof row.data.taskId !== 'string' || !row.data.taskId) {
      errors.push(`financeTaskLink:${row.id} has an invalid task reference.`);
    }
  }
  for (const row of byType.get('financeReconciliation') ?? []) {
    requireReference(row, 'budgetId', budgets, 'budget');
    if (
      !Number.isSafeInteger(row.data.budgetVersion) ||
      typeof row.data.sourceVersionDigest !== 'string' ||
      !/^[a-f0-9]{64}$/u.test(row.data.sourceVersionDigest)
    ) {
      errors.push(`financeReconciliation:${row.id} has invalid immutable history evidence.`);
    }
  }
  return {
    passed: errors.length === 0,
    counts: Object.fromEntries(
      [...byType.entries()].map(([type, values]) => [type, values.length]),
    ) as Partial<Record<FinanceRestoreEntityType, number>>,
    referencedTransactions: transactions.size,
    providerRequests: 0 as const,
    errors,
  };
}

const isRestoreObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export type RestoreExpectations = {
  tasks: number;
  privateTasks: number;
};

export type RestoreValidationContext = {
  recoveryPointAt: string;
  startedAt: string;
  completedAt: string;
  authorizationPassed: boolean;
  requiredKeyVersions: string[];
  restoredKeyVersions: string[];
  decryptedKeyVersions: string[];
  expectedArtifactHashes?: Record<string, string>;
  restoredArtifactHashes?: Record<string, string>;
};

export function validateRestore(
  expected: RestoreExpectations,
  tasks: Task[],
  context?: RestoreValidationContext,
) {
  const actual = {
    tasks: tasks.length,
    privateTasks: tasks.filter((task) => task.visibility === 'private').length,
  };
  const discrepancies: string[] = [];
  if (actual.tasks !== expected.tasks)
    discrepancies.push(`Expected ${expected.tasks} tasks; restored ${actual.tasks}.`);
  if (actual.privateTasks !== expected.privateTasks)
    discrepancies.push(
      `Expected ${expected.privateTasks} private tasks; restored ${actual.privateTasks}.`,
    );

  if (!context) return { passed: discrepancies.length === 0, actual, discrepancies };

  const rpoSeconds = secondsBetween(context.recoveryPointAt, context.startedAt);
  const rtoSeconds = secondsBetween(context.startedAt, context.completedAt);
  const restored = new Set(context.restoredKeyVersions);
  const decrypted = new Set(context.decryptedKeyVersions);
  const missingKeyVersions = context.requiredKeyVersions.filter(
    (version) => !restored.has(version),
  );
  const undecryptableKeyVersions = context.requiredKeyVersions.filter(
    (version) => !decrypted.has(version),
  );
  const hashMismatches = Object.entries(context.expectedArtifactHashes ?? {})
    .filter(([name, hash]) => context.restoredArtifactHashes?.[name] !== hash)
    .map(([name]) => name)
    .sort();

  if (!Number.isFinite(rpoSeconds) || rpoSeconds < 0 || rpoSeconds > MAX_RPO_SECONDS)
    discrepancies.push(`RPO ${rpoSeconds}s exceeds the ${MAX_RPO_SECONDS}s target.`);
  if (!Number.isFinite(rtoSeconds) || rtoSeconds < 0 || rtoSeconds > MAX_RTO_SECONDS)
    discrepancies.push(`RTO ${rtoSeconds}s exceeds the ${MAX_RTO_SECONDS}s target.`);
  if (!context.authorizationPassed) discrepancies.push('Authorization boundary validation failed.');
  if (missingKeyVersions.length)
    discrepancies.push(`Missing key versions: ${missingKeyVersions.join(', ')}.`);
  if (undecryptableKeyVersions.length)
    discrepancies.push(`Undecryptable key versions: ${undecryptableKeyVersions.join(', ')}.`);
  if (hashMismatches.length)
    discrepancies.push(`Artifact hash mismatches: ${hashMismatches.join(', ')}.`);

  return {
    passed: discrepancies.length === 0,
    actual,
    rpoSeconds,
    rtoSeconds,
    missingKeyVersions,
    undecryptableKeyVersions,
    hashMismatches,
    discrepancies,
  };
}

function secondsBetween(earlier: string, later: string): number {
  const difference = Date.parse(later) - Date.parse(earlier);
  if (!Number.isFinite(difference)) return Number.NaN;
  return difference / 1_000;
}

export function validateRestoreBeforeServing(
  expected: RestoreExpectations,
  tasks: Task[],
  context: RestoreValidationContext,
  deletionLedgerKeys: ReadonlySet<string>,
) {
  assertDeletionLedgerApplied({
    restoredRecords: tasks.map((task) => ({ resourceType: 'task', resourceId: task.id })),
    ledgerKeys: deletionLedgerKeys,
  });
  return validateRestore(expected, tasks, context);
}
