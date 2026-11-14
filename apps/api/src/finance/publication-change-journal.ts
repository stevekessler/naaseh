import { createHash } from 'node:crypto';

type Key = { PK: string; SK: string };
type Row = Key & Record<string, unknown>;
export interface FinanceCanonicalChange {
  scopePK: string;
  keyHash: string;
  collection: string;
  sourceId?: string;
  accountIds: string[];
  beforeVersion?: number;
  afterVersion?: number;
  removed?: true;
}
export interface FinanceScopeTransition {
  PK: string;
  beforeRevision: number;
  afterRevision: number;
}
export const isFinanceScopePartition = (PK: string) =>
  PK === 'FINANCE#CATALOG' || /^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(PK);
const sourceCollections = new Set([
  'accounts',
  'transactions',
  'merchants',
  'categories',
  'budgets',
  'budgetItems',
  'refundRelationships',
]);
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

/** Journal only identifiers/versions. Lock keys may contain names, so retain a digest instead. */
export function describeFinanceCanonicalChange(
  key: Key,
  before?: Row,
  after?: Row,
): FinanceCanonicalChange | undefined {
  if (!isFinanceScopePartition(key.PK) || !key.SK.startsWith('ROW#') || (!before && !after))
    return undefined;
  const row = after ?? before!;
  if (
    typeof row.collection !== 'string' ||
    !/^[A-Za-z][A-Za-z0-9]*$/.test(row.collection) ||
    typeof row.entryKey !== 'string' ||
    !row.entryKey ||
    !key.SK.startsWith(`ROW#${row.collection}#`)
  )
    throw new Error('Finance canonical change identity is invalid.');
  for (const value of [before, after])
    if (value && (value.collection !== row.collection || value.entryKey !== row.entryKey))
      throw new Error('Finance canonical change identity conflict.');
  const data = (value: Row | undefined) =>
    value?.data && typeof value.data === 'object'
      ? (value.data as Record<string, unknown>)
      : undefined;
  const old = data(before);
  const next = data(after);
  const accounts = [
    ...new Set(
      [
        old?.accountId,
        next?.accountId,
        ...(row.collection === 'accounts' ? [row.entryKey] : []),
      ].filter((id): id is string => typeof id === 'string' && Boolean(id)),
    ),
  ].sort();
  const version = (value: unknown) =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
  const beforeVersion = version(old?.version);
  const afterVersion = version(next?.version);
  return {
    scopePK: key.PK,
    keyHash: hash([key.PK, key.SK]),
    collection: row.collection,
    ...(sourceCollections.has(row.collection) ? { sourceId: row.entryKey } : {}),
    accountIds: accounts,
    ...(beforeVersion === undefined ? {} : { beforeVersion }),
    ...(afterVersion === undefined ? {} : { afterVersion }),
    ...(!after ? { removed: true as const } : {}),
  };
}

/** Durable prerequisite only: no dispatch, canonical hydration, migration or publication here. */
export function financePublicationJournalRecords(
  changes: FinanceCanonicalChange[],
  scopes: FinanceScopeTransition[],
): Row[] {
  if (!changes.length && !scopes.length) return [];
  const orderedScopes = [...scopes].sort((a, b) => a.PK.localeCompare(b.PK));
  if (
    !orderedScopes.length ||
    new Set(orderedScopes.map((scope) => scope.PK)).size !== orderedScopes.length ||
    orderedScopes.some(
      (scope) =>
        !isFinanceScopePartition(scope.PK) ||
        !Number.isSafeInteger(scope.beforeRevision) ||
        scope.beforeRevision < 0 ||
        !Number.isSafeInteger(scope.afterRevision) ||
        scope.afterRevision !== scope.beforeRevision + 1,
    ) ||
    changes.some((change) => !orderedScopes.some((scope) => scope.PK === change.scopePK))
  )
    throw new Error('Finance canonical scope revision transition is required.');
  const orderedChanges = [...changes].sort((a, b) => a.keyHash.localeCompare(b.keyHash));
  const format = 'finance-publication-change-v1';
  const id = hash({ format, changes: orderedChanges, scopes: orderedScopes });
  return [
    {
      PK: 'FINANCE#PUBLICATION_OUTBOX',
      SK: `PENDING#${id}`,
      format,
      id,
      state: 'pending',
      createdAt: new Date().toISOString(),
      changes: orderedChanges,
      scopes: orderedScopes,
    },
    ...orderedScopes.map((scope) => ({
      PK: scope.PK,
      SK: `PUBLICATION_CHANGE#${String(scope.afterRevision).padStart(16, '0')}`,
      format,
      publicationId: id,
      beforeRevision: scope.beforeRevision,
      afterRevision: scope.afterRevision,
    })),
    ...orderedChanges.flatMap((change) => {
      if (
        change.collection !== 'accounts' ||
        !change.sourceId ||
        change.removed ||
        change.beforeVersion !== undefined ||
        change.afterVersion !== 1 ||
        orderedChanges.some(
          (other) =>
            other.collection === 'accounts' && other.sourceId === change.sourceId && other.removed,
        )
      )
        return [];
      return [
        {
          PK: `FINANCE#PUBLICATION_ACCOUNT_BIRTH#${change.sourceId}`,
          SK: 'CURRENT',
          format: 'finance-publication-account-birth-v1',
          accountId: change.sourceId,
          publicationId: id,
          scopePK: change.scopePK,
        },
      ];
    }),
    ...orderedChanges.flatMap((change) => {
      if (
        !['transactions', 'accounts'].includes(change.collection) ||
        !change.sourceId ||
        !change.removed ||
        change.beforeVersion === undefined ||
        orderedChanges.some(
          (other) =>
            other.collection === change.collection &&
            other.sourceId === change.sourceId &&
            !other.removed,
        )
      )
        return [];
      if (change.afterVersion !== undefined)
        throw new Error('Finance physical deletion cannot retain a source version.');
      return [
        {
          PK: `${change.collection === 'accounts' ? 'FINANCE#PUBLICATION_ACCOUNT_DELETION' : 'FINANCE#PUBLICATION_DELETION'}#${change.sourceId}`,
          SK: 'CURRENT',
          format:
            change.collection === 'accounts'
              ? 'finance-publication-account-deletion-v1'
              : 'finance-publication-deletion-v1',
          publicationId: id,
          ...(change.collection === 'accounts'
            ? { accountId: change.sourceId }
            : { transactionId: change.sourceId }),
          scopePK: change.scopePK,
          accountIds: change.accountIds,
          beforeVersion: change.beforeVersion,
        },
      ];
    }),
  ];
}
