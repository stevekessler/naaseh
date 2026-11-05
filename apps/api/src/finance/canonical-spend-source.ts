import { z } from 'zod';
import {
  financialTransactionSchema,
  transactionSourceSnapshotSchema,
  transactionAllocationInputSchema,
  financeBudgetItemSchema,
  financeMerchantSchema,
} from '@naaseh/contracts';
import {
  expenseRefundRelationshipSchema,
  type FinancialTransaction,
  type BudgetItem,
  type ExpenseRefundRelationship,
} from '@naaseh/domain';
import { FinanceUnitOfWork, financeLocatorKey, loadTargetedFinanceEntity } from './unit-of-work.js';
import { createFinanceFact } from './spend-projection-service.js';
import { FinanceExperienceFailure } from './telemetry.js';

// The future refund repository must atomically maintain this credit singleton locator
// and the credit scope META revision. Pre-016 credits have no relationship collection.
export const FINANCE_REFUND_RELATIONSHIP_COLLECTION = 'refundRelationships';
export const financeRefundRelationshipLocator = (creditId: string) =>
  financeLocatorKey(FINANCE_REFUND_RELATIONSHIP_COLLECTION, creditId);
const sourceSchema = financialTransactionSchema.passthrough().extend({
  effectiveAt: z.string().datetime(),
  entrySnapshot: transactionSourceSnapshotSchema.passthrough().optional(),
  providerSnapshot: transactionSourceSnapshotSchema.passthrough().optional(),
  status: z.enum(['active', 'archived', 'tombstone']),
  allocations: z.array(transactionAllocationInputSchema.passthrough()).max(100),
  checkNumber: z.string().max(100).optional(),
});
const invalid = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** Rebuild a single source privately from canonical point reads, never a saved contribution copy. */
export async function loadCanonicalFinanceFact(
  transactionId: string,
  factory: () => FinanceUnitOfWork = () => new FinanceUnitOfWork(),
) {
  const work = factory();
  const dependencies: Record<string, number> = {};
  const load = async <T>(collection: string, id: string) => {
    const record = await loadTargetedFinanceEntity<T>(work, collection, id);
    if (record) {
      if (
        dependencies[record.scopeKey.PK] !== undefined &&
        dependencies[record.scopeKey.PK] !== record.scopeRevision
      )
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance source revision changed; restart required.',
          'user',
        );
      dependencies[record.scopeKey.PK] = record.scopeRevision;
    }
    return record;
  };
  const loadTransaction = async (id: string) => {
    const record = await load<FinancialTransaction>('transactions', id);
    if (!record || record.value.id !== id)
      return invalid('Finance canonical transaction source is missing.');
    const parsed = sourceSchema.safeParse(record.value);
    if (!parsed.success) return invalid('Finance canonical transaction source is invalid.');
    const transaction = parsed.data as unknown as FinancialTransaction;
    const account = await load<{ id: string }>('accounts', transaction.accountId);
    if (
      !account ||
      account.value.id !== transaction.accountId ||
      account.storageKey.PK !== record.storageKey.PK
    )
      return invalid('Finance canonical account/source invariant failed.');
    return { record, transaction };
  };
  const { record, transaction } = await loadTransaction(transactionId);
  const budgetItems: BudgetItem[] = [];
  for (const id of new Set(
    transaction.allocations.flatMap((allocation) =>
      allocation.budgetItemId ? [allocation.budgetItemId] : [],
    ),
  )) {
    const source = await load<BudgetItem>('budgetItems', id);
    const parsed = financeBudgetItemSchema.passthrough().safeParse(source?.value);
    if (
      !parsed.success ||
      parsed.data.id !== id ||
      parsed.data.currency !== transaction.currency ||
      parsed.data.currencyExponent !== transaction.currencyExponent
    )
      return invalid('Finance canonical budget allocation source is missing or invalid.');
    budgetItems.push(parsed.data as BudgetItem);
  }
  let merchantName: string | undefined;
  if (transaction.merchantId) {
    const source = await load<Record<string, unknown>>('merchants', transaction.merchantId);
    const parsed = financeMerchantSchema.passthrough().safeParse(source?.value);
    if (
      !parsed.success ||
      parsed.data.id !== transaction.merchantId ||
      parsed.data.status === 'merged'
    )
      return invalid('Finance canonical merchant source requires resolution.');
    merchantName = parsed.data.name;
  }
  let refund: ExpenseRefundRelationship | undefined;
  let original: FinancialTransaction | undefined;
  if (transaction.amountMinor > 0) {
    const relationship = await load<ExpenseRefundRelationship>(
      FINANCE_REFUND_RELATIONSHIP_COLLECTION,
      transaction.id,
    );
    if (!relationship) {
      const scope = await work.get(record.scopeKey);
      if (scope?.refundRelationshipIndexVersion !== 1)
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance refund source coverage is incomplete; rebuild required.',
          'user',
        );
    }
    if (relationship) {
      const parsed = expenseRefundRelationshipSchema.safeParse(relationship.value);
      if (
        !parsed.success ||
        parsed.data.refundTransactionId !== transaction.id ||
        relationship.storageKey.PK !== record.storageKey.PK
      )
        return invalid('Finance canonical refund source invariant failed.');
      if (parsed.data.status === 'active') {
        refund = parsed.data;
        original = (await loadTransaction(refund.originalExpenseTransactionId)).transaction;
      }
    }
  }
  // A scope/catalog version guards the entire source graph, including negative singleton reads.
  // The verifier conditions these same dependencies again when it publishes coverage.
  const fresh = factory();
  for (const [PK, revision] of Object.entries(dependencies)) {
    if ((await fresh.get({ PK, SK: 'META' }))?.revision !== revision)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance source revision changed; restart required.',
        'user',
      );
  }
  return {
    fact: createFinanceFact(
      transaction,
      { budgetItems, ...(refund && original ? { refund, original } : {}) },
      merchantName,
    ),
    dependencies,
    sourceKey: record.storageKey,
  };
}
