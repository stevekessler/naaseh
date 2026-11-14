import { createHash } from 'node:crypto';
import type { FinanceFact } from './query-contract.js';

export const financeSourceDependencyIndexVersion = 1;
export type FinanceSourceDependencyKind =
  | 'merchant'
  | 'budgetItem'
  | 'originalExpense'
  | 'originalAccount';
type Kind = FinanceSourceDependencyKind;
export function financeSourceDependencyPartition(kind: Kind, sourceId: string) {
  if (!sourceId || sourceId.length > 200) throw new Error('Invalid Finance source dependency.');
  return `FINANCE#FACT_DEPENDENCY#${kind}#${sourceId}`;
}
export function financeFactSourceDependencies(fact: FinanceFact) {
  const partitions = new Set<string>();
  const add = (kind: Kind, id?: string) => {
    if (id) partitions.add(financeSourceDependencyPartition(kind, id));
  };
  add('merchant', fact.merchantId);
  for (const id of fact.originalSourceAccountIds ?? []) add('originalAccount', id);
  for (const slice of fact.slices) {
    add('budgetItem', slice.budgetItemId);
    add('originalExpense', slice.originalExpenseTransactionId);
  }
  return [...partitions].sort().map((PK) => ({
    PK,
    SK: `ACCOUNT#${fact.accountId}#TRANSACTION#${fact.id}`,
    accountId: fact.accountId,
    transactionId: fact.id,
  }));
}
export function financePublicationSource(fact: FinanceFact) {
  const value = { ...fact };
  delete value.textMonth;
  delete value.textOrdinal;
  return value;
}
// DynamoDB maps have no property order. Lists retain their canonical allocation order.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export const sameFinancePublicationSource = (a: FinanceFact, b: FinanceFact) =>
  JSON.stringify(canonical(financePublicationSource(a))) ===
  JSON.stringify(canonical(financePublicationSource(b)));
export const financePublicationFingerprint = (fact: FinanceFact, calendarBasis: string) =>
  createHash('sha256')
    .update(
      JSON.stringify(
        canonical({
          next: financePublicationSource(fact),
          calendarBasis,
          textPostingVersion: 2,
          dependencyIndexVersion: financeSourceDependencyIndexVersion,
        }),
      ),
    )
    .digest('hex');
