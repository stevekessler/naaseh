import { describe, expect, it } from 'vitest';
import {
  validateFinanceRestore,
  type FinanceRestoreRow,
} from '../../apps/api/src/crypto-recovery/restore-validator.js';

const digest = 'a'.repeat(64);
const rows: FinanceRestoreRow[] = [
  { entityType: 'financeAccount', id: 'account-1', data: { id: 'account-1', status: 'active' } },
  {
    entityType: 'financeBalanceSnapshot',
    id: 'snapshot-1',
    data: { id: 'snapshot-1', accountId: 'account-1', balanceMinor: 10_000 },
  },
  {
    entityType: 'financeCsvImportBatch',
    id: 'batch-1',
    data: { id: 'batch-1', accountId: 'account-1', fileDigest: digest, committedOrdinals: [1] },
  },
  {
    entityType: 'financeTransaction',
    id: 'transaction-csv',
    data: {
      id: 'transaction-csv',
      accountId: 'account-1',
      origin: 'csv',
      csvImportBatchId: 'batch-1',
      csvRowOrdinal: 1,
      entrySnapshot: { amountMinor: -2_500 },
      amountMinor: -2_500,
      allocations: [{ id: 'allocation-1', amountMinor: -2_500 }],
    },
  },
  {
    entityType: 'financeTransaction',
    id: 'transaction-reconciled',
    data: {
      id: 'transaction-reconciled',
      accountId: 'account-1',
      origin: 'manual',
      entrySnapshot: { amountMinor: -1_000 },
      providerSnapshot: { amountMinor: -1_000 },
      providerConnectionId: 'connection-1',
      providerAccountId: 'provider-account-1',
      sourceTransactionId: 'provider-transaction-1',
      reconciliationState: 'reconciled',
      amountMinor: -1_000,
      allocations: [],
    },
  },
  { entityType: 'financeBudget', id: 'budget-1', data: { id: 'budget-1', version: 2 } },
  {
    entityType: 'financeBudgetAccountLink',
    id: 'budget-account-1',
    data: { budgetId: 'budget-1', accountId: 'account-1' },
  },
  { entityType: 'financeBudgetItem', id: 'budget-item-1', data: { budgetId: 'budget-1' } },
  {
    entityType: 'financeTaskLink',
    id: 'task-link-1',
    data: { budgetItemId: 'budget-item-1', taskId: 'task-1' },
  },
  {
    entityType: 'financeReconciliation',
    id: 'reconciliation-1',
    data: { budgetId: 'budget-1', budgetVersion: 2, sourceVersionDigest: digest },
  },
];

describe('Finance restore validation', () => {
  it('validates accounts, snapshots, CSV receipts, source identity, allocations, budgets, links, and history offline', () => {
    expect(validateFinanceRestore(rows)).toMatchObject({
      passed: true,
      referencedTransactions: 2,
      providerRequests: 0,
      errors: [],
      counts: {
        financeAccount: 1,
        financeBalanceSnapshot: 1,
        financeCsvImportBatch: 1,
        financeTransaction: 2,
        financeBudget: 1,
        financeBudgetAccountLink: 1,
        financeBudgetItem: 1,
        financeTaskLink: 1,
        financeReconciliation: 1,
      },
    });
  });

  it('fails closed when restored relationships or immutable source evidence are incomplete', () => {
    const broken = rows.map((row) =>
      row.id === 'transaction-reconciled'
        ? {
            ...row,
            data: { ...row.data, entrySnapshot: undefined, sourceTransactionId: undefined },
          }
        : row.id === 'budget-account-1'
          ? { ...row, data: { ...row.data, accountId: 'missing-account' } }
          : row.id === 'reconciliation-1'
            ? { ...row, data: { ...row.data, sourceVersionDigest: 'invalid' } }
            : row,
    );
    const result = validateFinanceRestore(broken);
    expect(result.passed).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('entry snapshot'),
        expect.stringContaining('reconciled source evidence'),
        expect.stringContaining('account reference'),
        expect.stringContaining('immutable history evidence'),
      ]),
    );
    expect(result.errors.join(' ')).not.toContain('provider-transaction-1');
  });
});
