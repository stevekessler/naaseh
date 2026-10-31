import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import { createUlid, financeAudience, type FinanceScope } from '@naaseh/domain';
import type { FinanceActor } from './authorization.js';
import { FinanceMemoryRepository, financeKeys } from './repository.js';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { buildTaskTransaction, feedTransactionItems } from '../shared/store.js';
import { prepareAudienceChanges } from '../sync/change-feed-repository.js';
import { FinanceUnitOfWork, financeLocatorKey } from './unit-of-work.js';

const catalog = 'FINANCE#CATALOG';
const partitionFor = (scope: FinanceScope) => `FINANCE#SCOPE#${financeAudience(scope)}`;
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const collections = [
  'accounts',
  'balanceSnapshots',
  'transactions',
  'transfers',
  'categories',
  'merchants',
  'budgets',
  'budgetAccountLinks',
  'budgetItems',
  'budgetReconciliations',
  'financialTaskLinks',
  'reusableItems',
  'reusableOccurrenceLocks',
  'transactionMatches',
  'reviewIssues',
  'transactionAliases',
  'keptSeparatePairs',
  'categoryNameLocks',
  'merchantKeyLocks',
  'catalogReferenceCounts',
  'csvBatches',
  'csvFileReceipts',
  'csvRowReceipts',
  'sourceIdentities',
  'connections',
  'importJobs',
  'pendingSimplefinAccounts',
  'deletionPreviews',
] as const;
type Collection = (typeof collections)[number];
type StateRow = {
  PK: string;
  SK: string;
  collection: Collection;
  entryKey: string;
  data: unknown;
};
type Writes = NonNullable<TransactWriteCommandInput['TransactItems']>;
const rowId = (row: { PK: string; SK: string }) => `${row.PK}/${row.SK}`;
// CSV batches contain Sets, including the empty Set that DynamoDB cannot marshal natively.
const encode = (value: unknown): unknown =>
  JSON.parse(
    JSON.stringify(value, (_key, entry) =>
      entry instanceof Set ? { financeSet: [...entry] } : entry,
    ),
  );
const decode = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value), (_key, entry) =>
    entry &&
    typeof entry === 'object' &&
    Object.keys(entry).length === 1 &&
    Array.isArray(entry.financeSet)
      ? new Set(entry.financeSet)
      : entry,
  );

/**
 * Request-local domain state backed by strongly consistent, scope-keyed DynamoDB rows.
 * Scope revisions protect the whole read set, including negative reads and identity locks.
 * No warm Lambda state is authoritative; every successful response follows an atomic commit.
 */
export class DynamoFinanceRepository extends FinanceMemoryRepository {
  /** New experience services load only their touched graph; never invoke forActor for these paths. */
  static targetedUnitOfWork() {
    return new FinanceUnitOfWork();
  }

  /** Trusted restartable migration page; never called as a fallback from a user's read. */
  static async backfillLocatorPage(partition: string, cursor?: { PK: string; SK: string }) {
    if (!/^FINANCE#SCOPE#(?:OWNER|GROUP)#[^#]+$/u.test(partition) && partition !== catalog)
      throw new Error('Invalid Finance backfill scope.');
    if (cursor && cursor.PK !== partition) throw new Error('Invalid Finance backfill cursor.');
    const work = new FinanceUnitOfWork();
    const scope = await work.get({ PK: partition, SK: 'META' });
    const page = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': partition, ':prefix': 'ROW#' },
        ConsistentRead: true,
        Limit: 40,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    const collections = new Set([
      'accounts',
      'transactions',
      'budgets',
      'budgetItems',
      'categories',
      'merchants',
    ]);
    for (const candidate of page.Items ?? []) {
      if (!collections.has(candidate.collection as string)) continue;
      const row = await work.get({ PK: partition, SK: String(candidate.SK) });
      if (row)
        await work.put({
          ...financeLocatorKey(String(row.collection), String(row.entryKey)),
          storageKey: { PK: partition, SK: String(row.SK) },
        });
    }
    const nextCursor = page.LastEvaluatedKey as { PK: string; SK: string } | undefined;
    return work.commit({
      key: {
        PK: partition,
        SK: `LOCATOR_BACKFILL#${digest(JSON.stringify([cursor, scope?.revision ?? 0]))}`,
      },
      fingerprint: 'finance-locator-v1',
      result: {
        nextCursor: nextCursor ?? null,
        examined: page.ScannedCount ?? page.Items?.length ?? 0,
      },
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
  }
  private readonly versions = new Map<string, number>();
  private baseline = new Map<string, StateRow>();
  private readonly loadedTaskIds = new Set<string>();
  private readonly loadedReceipts = new Set<string>();
  private readonly effects: Array<() => Promise<void>> = [];

  static async forActor(actor: FinanceActor, mutationId?: string) {
    const repository = new DynamoFinanceRepository();
    const partitions = [catalog];
    if (actor.active && actor.role !== 'admin') {
      partitions.push(partitionFor({ type: 'owner', ownerId: actor.id }));
      for (const { groupId } of actor.groupMemberships)
        partitions.push(partitionFor({ type: 'group', groupId }));
    }
    await repository.load([...new Set(partitions)]);
    if (mutationId) {
      const result = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: financeKeys.mutationReceipt(actor.id, mutationId),
          ConsistentRead: true,
        }),
      );
      const required = result.Item?.requiredPartitions as string[] | undefined;
      // A receipt can contain protected results. Revoked scopes must not survive via replay.
      if (result.Item && required && required.every((pk) => repository.versions.has(pk))) {
        const key = `${actor.id}:${mutationId}`;
        repository.mutationReceipts.set(key, decode(result.Item.data));
        repository.loadedReceipts.add(key);
      }
    }
    return repository;
  }

  static async forConnection(connectionId: string) {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: financeKeys.connection(connectionId),
        ConsistentRead: true,
      }),
    );
    const scope = result.Item?.scope as FinanceScope | undefined;
    if (!scope) throw new Error('Finance connection not found.');
    const repository = new DynamoFinanceRepository();
    await repository.load([
      ...new Set([
        catalog,
        partitionFor(scope),
        ...((result.Item?.accountPartitions ?? []) as string[]),
      ]),
    ]);
    if (!repository.connections.has(connectionId)) throw new Error('Finance connection not found.');
    return repository;
  }

  private async revision(PK: string) {
    const result = await dynamodb.send(
      new GetCommand({
        TableName: tableName,
        Key: { PK, SK: 'META' },
        ConsistentRead: true,
      }),
    );
    return Number(result.Item?.revision ?? 0);
  }

  private async load(partitions: string[]) {
    for (const PK of partitions) {
      const revision = await this.revision(PK);
      let cursor: Record<string, unknown> | undefined;
      do {
        const page = await dynamodb.send(
          new QueryCommand({
            TableName: tableName,
            ConsistentRead: true,
            Limit: 200,
            KeyConditionExpression: 'PK = :pk AND begins_with(SK, :row)',
            ExpressionAttributeValues: { ':pk': PK, ':row': 'ROW#' },
            ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          }),
        );
        for (const item of page.Items ?? []) {
          const row = item as StateRow;
          if (!collections.includes(row.collection))
            throw new Error('Invalid Finance storage row.');
          this.baseline.set(rowId(row), row);
          const target = this[row.collection] as Map<string, unknown> | unknown[] | Set<string>;
          const value = decode(row.data);
          if (target instanceof Map) target.set(row.entryKey, value);
          else if (target instanceof Set) target.add(row.entryKey);
          else target.push(value);
        }
        cursor = page.LastEvaluatedKey;
      } while (cursor);
      if ((await this.revision(PK)) !== revision)
        throw new Error('Finance storage version conflict.');
      this.versions.set(PK, revision);
    }
    for (const { taskId } of this.financialTaskLinks.values()) {
      if (this.loadedTaskIds.has(taskId)) continue;
      const task = await dynamodb.send(
        new GetCommand({
          TableName: tableName,
          Key: { PK: `TASK#${taskId}`, SK: 'CURRENT' },
          ConsistentRead: true,
        }),
      );
      if (task.Item?.data) this.tasks.set(taskId, task.Item.data);
      this.loadedTaskIds.add(taskId);
    }
  }

  private scopeFor(collection: Collection, key: string, value: unknown): string | undefined {
    if (
      [
        'categories',
        'merchants',
        'categoryNameLocks',
        'merchantKeyLocks',
        'catalogReferenceCounts',
      ].includes(collection)
    )
      return catalog;
    const data = value as Record<string, unknown> | undefined;
    if (data?.scope) return partitionFor(data.scope as FinanceScope);
    if (typeof data?.groupId === 'string')
      return partitionFor({ type: 'group', groupId: data.groupId });
    if (collection === 'budgetAccountLinks' && typeof data?.budgetId === 'string') {
      const budget = this.budgets.get(data.budgetId);
      if (budget) return partitionFor({ type: 'group', groupId: budget.groupId });
    }
    if (typeof data?.accountId === 'string') {
      const scope = this.accounts.get(data.accountId)?.scope;
      if (scope) return partitionFor(scope);
    }
    if (typeof data?.budgetId === 'string') {
      const budget = this.budgets.get(data.budgetId);
      if (budget) return partitionFor({ type: 'group', groupId: budget.groupId });
    }
    if (typeof data?.connectionId === 'string') {
      const scope = this.connections.get(data.connectionId)?.scope as FinanceScope | undefined;
      if (scope) return partitionFor(scope);
    }
    if (typeof data?.transactionId === 'string') {
      const transaction = this.transactions.find(({ id }) => id === data.transactionId);
      if (transaction) return this.scopeFor('transactions', transaction.id, transaction);
    }
    if (['csvFileReceipts', 'csvRowReceipts'].includes(collection)) {
      const account = [...this.accounts.values()].find(({ id }) => key.startsWith(`${id}:`));
      if (account) return partitionFor(account.scope);
    }
    if (collection === 'pendingSimplefinAccounts') {
      const connection = [...this.connections].find(([id]) => key.startsWith(`${id}:`))?.[1];
      if (connection?.scope) return partitionFor(connection.scope as FinanceScope);
    }
    if (collection === 'reusableOccurrenceLocks') {
      const item = this.budgetItems.get(String(value));
      if (item) return this.scopeFor('budgetItems', item.id, item);
    }
    if (
      collection === 'sourceIdentities' ||
      collection === 'transactionAliases' ||
      collection === 'keptSeparatePairs'
    ) {
      const account = this.accounts.get(String(value));
      if (account) return partitionFor(account.scope);
      const transaction = this.transactions.find(
        ({ id }) => id === value || id === key || key.startsWith(`${id}:`),
      );
      if (transaction) return this.scopeFor('transactions', transaction.id, transaction);
    }
    if (collection === 'deletionPreviews' && data) {
      const id = String(data.recordId);
      if (data.recordType === 'category' || data.recordType === 'merchant') return catalog;
      const entity =
        this.accounts.get(id) ??
        this.budgets.get(id) ??
        this.reusableItems.get(id) ??
        this.transactionMatches.get(id) ??
        this.financialTaskLinks.get(id) ??
        this.transactions.find((entry) => entry.id === id);
      if (entity) return this.scopeFor('accounts', id, entity);
    }
    return undefined;
  }

  private snapshot() {
    const previous = new Map(
      [...this.baseline.values()].map((row) => [`${row.collection}/${row.entryKey}`, row.PK]),
    );
    const rows = new Map<string, StateRow>();
    for (const collection of collections) {
      const source = this[collection];
      const entries: Array<[string, unknown]> =
        source instanceof Map
          ? [...source]
          : source instanceof Set
            ? [...source].map((key) => [key, true])
            : source.map((value) => [value.id, value]);
      for (const [entryKey, value] of entries) {
        const PK =
          this.scopeFor(collection, entryKey, value) ?? previous.get(`${collection}/${entryKey}`);
        if (!PK || !this.versions.has(PK)) throw new Error('Finance storage scope is unavailable.');
        const row = {
          PK,
          SK: `ROW#${collection}#${digest(entryKey)}`,
          collection,
          entryKey,
          data: encode(value),
        };
        rows.set(rowId(row), row);
      }
    }
    return rows;
  }

  override async afterCommit(effect: () => Promise<void>) {
    this.effects.push(effect);
  }

  async commit() {
    await this.checkpoint();
    for (const effect of this.effects) await effect();
    this.effects.length = 0;
  }

  override async checkpoint() {
    let next = this.snapshot();
    this.updateCatalogReferences(next);
    next = this.snapshot();
    const changed = [...next].filter(([id, row]) => !isDeepStrictEqual(this.baseline.get(id), row));
    const removed = [...this.baseline].filter(([id]) => !next.has(id));
    const newReceipts = [...this.mutationReceipts].filter(([key]) => !this.loadedReceipts.has(key));
    if (!changed.length && !removed.length && !newReceipts.length && !this.feedChanges.length)
      return;
    const changedPartitions = new Set([...changed, ...removed].map(([, row]) => row.PK));
    const writes: Writes = [
      ...changed.map(([, row]) => ({ Put: { TableName: tableName, Item: row } })),
      ...removed.map(([, row]) => ({
        Delete: { TableName: tableName, Key: { PK: row.PK, SK: row.SK } },
      })),
    ];
    // Server-only locators bridge legacy scope rows to touched-record reads. Keep both writers
    // on the same scope META revision so a new service and an older request cannot overwrite.
    const locatorCollections = new Set<Collection>([
      'accounts',
      'transactions',
      'budgets',
      'budgetItems',
      'categories',
      'merchants',
    ]);
    const liveLocators = new Set<string>();
    for (const [, row] of changed)
      if (locatorCollections.has(row.collection)) {
        const key = financeLocatorKey(row.collection, row.entryKey);
        liveLocators.add(rowId(key));
        writes.push({
          Put: { TableName: tableName, Item: { ...key, storageKey: { PK: row.PK, SK: row.SK } } },
        });
      }
    for (const [, row] of removed)
      if (locatorCollections.has(row.collection)) {
        const key = financeLocatorKey(row.collection, row.entryKey);
        if (!liveLocators.has(rowId(key)))
          writes.push({ Delete: { TableName: tableName, Key: key } });
      }
    for (const [PK, revision] of this.versions) {
      const condition = revision === 0 ? 'attribute_not_exists(PK)' : '#revision = :expected';
      const attributes =
        revision === 0
          ? {}
          : {
              ExpressionAttributeNames: { '#revision': 'revision' },
              ExpressionAttributeValues: { ':expected': revision },
            };
      writes.push(
        changedPartitions.has(PK)
          ? {
              Put: {
                TableName: tableName,
                Item: { PK, SK: 'META', revision: revision + 1 },
                ConditionExpression: condition,
                ...attributes,
              },
            }
          : {
              ConditionCheck: {
                TableName: tableName,
                Key: { PK, SK: 'META' },
                ConditionExpression: condition,
                ...attributes,
              },
            },
      );
    }
    // A reassigned provider account can live outside its connection's original scope.
    // The importer follows server-only locators so it preserves the existing identity owner.
    const locatedConnections = new Set(
      changed.filter(([, row]) => row.collection === 'connections').map(([, row]) => row.entryKey),
    );
    for (const [, row] of changed) {
      if (row.collection !== 'accounts') continue;
      const account = this.accounts.get(row.entryKey)!;
      if (account.connectionId) locatedConnections.add(account.connectionId);
    }
    for (const connectionId of locatedConnections) {
      const Key = financeKeys.connection(connectionId);
      const previous = (
        await dynamodb.send(new GetCommand({ TableName: tableName, Key, ConsistentRead: true }))
      ).Item;
      const scope = this.connections.get(connectionId)?.scope ?? previous?.scope;
      if (!scope) throw new Error('Finance connection not found.');
      const revision = Number(previous?.revision ?? 0);
      const accountPartitions = [
        ...new Set([
          ...((previous?.accountPartitions ?? []) as string[]),
          ...[...this.accounts.values()]
            .filter((account) => account.connectionId === connectionId)
            .map((account) => partitionFor(account.scope)),
        ]),
      ];
      writes.push({
        Put: {
          TableName: tableName,
          Item: { ...Key, scope, accountPartitions, revision: revision + 1 },
          ...(previous
            ? {
                ConditionExpression: '#revision = :expected',
                ExpressionAttributeNames: { '#revision': 'revision' },
                ExpressionAttributeValues: { ':expected': revision },
              }
            : { ConditionExpression: 'attribute_not_exists(PK)' }),
        },
      });
    }
    for (const [, row] of removed) {
      if (row.collection === 'connections' && !this.connections.has(row.entryKey))
        writes.push({
          Delete: { TableName: tableName, Key: financeKeys.connection(row.entryKey) },
        });
    }
    for (const [key, data] of newReceipts) {
      const separator = key.indexOf(':');
      writes.push({
        Put: {
          TableName: tableName,
          Item: {
            ...financeKeys.mutationReceipt(key.slice(0, separator), key.slice(separator + 1)),
            data: encode(data),
            requiredPartitions: [...this.versions.keys()].filter((pk) => pk !== catalog),
            expiresAt: Math.floor(Date.now() / 1000) + 2_592_000,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      });
    }
    for (const task of this.tasks.values()) {
      if (this.loadedTaskIds.has(task.id)) continue;
      writes.push(
        ...buildTaskTransaction(
          task,
          {
            id: createUlid(),
            taskId: task.id,
            actorId: task.ownerId,
            version: task.version,
            changedAt: task.updatedAt,
            operation: 'create',
            changedFields: ['label'],
            after: { label: task.label },
            syncOutcome: 'applied',
          },
          createUlid(),
        ).TransactItems!,
      );
    }
    const changes = await prepareAudienceChanges(this.feedChanges);
    writes.push(...feedTransactionItems(changes));
    // Fail before writing anything; callers checkpoint large imports in bounded batches.
    if (writes.length > 100 || Buffer.byteLength(JSON.stringify(writes)) > 3_500_000)
      throw new Error('Finance operation exceeds the atomic batch limit.');
    try {
      await dynamodb.send(new TransactWriteCommand({ TransactItems: writes }));
    } catch (error) {
      if (error instanceof Error && error.name === 'TransactionCanceledException')
        throw new Error('Finance storage version conflict.');
      throw error;
    }
    this.baseline = next;
    for (const PK of changedPartitions) this.versions.set(PK, this.versions.get(PK)! + 1);
    for (const [key] of newReceipts) this.loadedReceipts.add(key);
    for (const id of this.tasks.keys()) this.loadedTaskIds.add(id);
    this.feedChanges.length = 0;
  }

  private updateCatalogReferences(next: Map<string, StateRow>) {
    const counts = new Map(
      [...this.baseline.values()]
        .filter((row) => row.collection === 'catalogReferenceCounts')
        .map((row) => [row.entryKey, Number(row.data)]),
    );
    const references = (row: StateRow): string[] => {
      if (!['transactions', 'budgetItems', 'reusableItems', 'merchants'].includes(row.collection))
        return [];
      const data = row.data as Record<string, unknown>;
      const refs: string[] = [];
      if (typeof data.financeCategoryId === 'string')
        refs.push(`category:${data.financeCategoryId}`);
      if (typeof data.merchantId === 'string') refs.push(`merchant:${data.merchantId}`);
      for (const allocation of (data.allocations ?? []) as Array<{ financeCategoryId?: string }>)
        if (allocation.financeCategoryId) refs.push(`category:${allocation.financeCategoryId}`);
      return [...new Set(refs)];
    };
    for (const [id, row] of this.baseline) {
      if (isDeepStrictEqual(next.get(id), row)) continue;
      for (const ref of references(row)) counts.set(ref, (counts.get(ref) ?? 0) - 1);
    }
    for (const [id, row] of next) {
      if (isDeepStrictEqual(this.baseline.get(id), row)) continue;
      for (const ref of references(row)) counts.set(ref, (counts.get(ref) ?? 0) + 1);
    }
    this.catalogReferenceCounts.clear();
    for (const [ref, count] of counts) {
      if (count < 0) throw new Error('Finance catalog reference invariant failed.');
      if (count) this.catalogReferenceCounts.set(ref, count);
    }
  }
}
