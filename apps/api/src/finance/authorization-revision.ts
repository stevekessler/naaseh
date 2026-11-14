import { isDeepStrictEqual } from 'node:util';

type Row = {
  PK: string;
  SK: string;
  collection?: unknown;
  entryKey?: unknown;
  data?: unknown;
  financeSourceAccountIds?: unknown;
};
const scope = (PK: string) => /^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(PK);
const entities = new Set([
  'accounts',
  'transactions',
  'balanceSnapshots',
  'transfers',
  'budgets',
  'budgetItems',
  'budgetAccountLinks',
  'budgetReconciliations',
  'financialTaskLinks',
  'reusableItems',
  'transactionMatches',
  'reviewIssues',
  'upcomingExpenses',
  'fulfillments',
  'receipts',
  'refundRelationships',
  'dashboardPreferences',
]);
const identity = (row: Row | undefined) =>
  row &&
  (scope(row.PK) ||
    (row.PK === 'FINANCE#CATALOG' &&
      ['categories', 'merchants'].includes(String(row.collection)))) &&
  typeof row.collection === 'string' &&
  (entities.has(row.collection) || ['categories', 'merchants'].includes(row.collection)) &&
  typeof row.entryKey === 'string'
    ? JSON.stringify([row.collection, row.entryKey])
    : undefined;
const normalized = (value: unknown): unknown =>
  Array.isArray(value)
    ? value
        .map(normalized)
        .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => [key, normalized(item)]),
        )
      : value;
function authority(row: Row) {
  const data =
    row.data && typeof row.data === 'object' ? (row.data as Record<string, unknown>) : {};
  const bindings: Record<string, unknown> = {};
  for (const key of [
    'scope',
    'ownerId',
    'userId',
    'accountId',
    'groupId',
    'budgetId',
    'budgetItemId',
    'taskId',
    'targetId',
    'targetType',
    'transactionId',
    'refundTransactionId',
    'originalExpenseTransactionId',
    'relatedAccountIds',
    'legTransactionIds',
    'originalSourceAccountIds',
  ])
    if (data[key] !== undefined) bindings[key] = normalized(data[key]);
  if (Array.isArray(data.allocations))
    bindings.allocationBudgets = normalized(
      data.allocations.flatMap((value) =>
        value && typeof value === 'object' && typeof value.budgetItemId === 'string'
          ? [value.budgetItemId]
          : [],
      ),
    );
  if (row.financeSourceAccountIds !== undefined)
    bindings.reconciliationSources = normalized(row.financeSourceAccountIds);
  return {
    PK: row.PK,
    bindings,
    withdrawn: ['tombstone', 'removed', 'deleting'].includes(String(data.status)),
  };
}

/** Join physical move pairs by logical identity; genuine creation cannot revoke existing cache rights. */
export function financeAuthorizationPartitions(changes: Array<{ before?: Row; after?: Row }>) {
  const before = new Map<string, Row>(),
    after = new Map<string, Row>();
  for (const change of changes)
    for (const [row, target] of [
      [change.before, before],
      [change.after, after],
    ] as const) {
      const key = identity(row);
      if (!key || !row) continue;
      const prior = target.get(key);
      if (prior && !isDeepStrictEqual(prior, row))
        throw new Error('Finance authorization revision has conflicting source identities.');
      target.set(key, row);
    }
  const partitions = new Set<string>();
  for (const [key, previous] of before) {
    const next = after.get(key);
    if (next && isDeepStrictEqual(authority(previous), authority(next))) continue;
    partitions.add(previous.PK);
    if (next) partitions.add(next.PK);
  }
  return partitions;
}

export function nextFinanceAuthorizationRevision(
  current: unknown,
  changed: boolean,
): number | undefined {
  if (current !== undefined && (!Number.isSafeInteger(current) || Number(current) < 0))
    throw new Error('Invalid Finance authorization revision.');
  if (!changed) return current as number | undefined;
  const next = Number(current ?? 0) + 1;
  if (!Number.isSafeInteger(next)) throw new Error('Finance authorization revision exhausted.');
  return next;
}
