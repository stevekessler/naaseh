import {
  financeAuthorizationPartitions,
  nextFinanceAuthorizationRevision,
} from './authorization-revision.js';
import {
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { isDeepStrictEqual } from 'node:util';
import { requestFinancePublication } from './publication-dispatch.js';
import {
  describeFinanceCanonicalChange,
  financePublicationJournalRecords,
  isFinanceScopePartition,
} from './publication-change-journal.js';

export interface FinanceRecordKey {
  PK: string;
  SK: string;
}
export const financeLocatorKey = (collection: string, entityId: string): FinanceRecordKey => ({
  PK: `FINANCE#LOCATOR#${collection}#${entityId}`,
  SK: 'CURRENT',
});

export async function loadTargetedFinanceEntity<T>(
  work: FinanceUnitOfWork,
  collection: string,
  entityId: string,
) {
  const locator = await work.get(financeLocatorKey(collection, entityId));
  if (!locator) return undefined; // Missing backfill is incomplete coverage, never a whole-scope fallback.
  const storageKey = locator.storageKey as FinanceRecordKey | undefined;
  if (
    !storageKey ||
    (!storageKey.PK.startsWith('FINANCE#SCOPE#') && storageKey.PK !== 'FINANCE#CATALOG') ||
    !storageKey.SK.startsWith(`ROW#${collection}#`)
  )
    throw new Error('Finance locator invariant failed.');
  const row = await work.get(storageKey);
  if (!row || row.entryKey !== entityId || row.collection !== collection)
    throw new Error('Finance locator is stale; rebuild required.');
  const scopeKey = { PK: storageKey.PK, SK: 'META' };
  const scope = await work.get(scopeKey);
  if (!scope || !Number.isSafeInteger(scope.revision))
    throw new Error('Finance scope revision is unavailable.');
  return { value: row.data as T, storageKey, scopeKey, scopeRevision: Number(scope.revision) };
}
type Item = FinanceRecordKey & Record<string, unknown>;
type Write = NonNullable<TransactWriteCommandInput['TransactItems']>[number];
export interface FinancePersistence {
  get(key: FinanceRecordKey): Promise<Item | undefined>;
  write(items: Write[]): Promise<void>;
}
export function financePersistence(table = tableName): FinancePersistence {
  return {
    get: async (key) =>
      (await dynamodb.send(new GetCommand({ TableName: table, Key: key, ConsistentRead: true })))
        .Item as Item | undefined,
    write: async (items) => {
      await dynamodb.send(new TransactWriteCommand({ TransactItems: items }));
    },
  };
}
const identity = (key: FinanceRecordKey) => JSON.stringify([key.PK, key.SK]);

/** Conditions every touched record, including negative reads; no account/scope hydration. */
export class FinanceUnitOfWork {
  private readonly loaded = new Map<string, { key: FinanceRecordKey; item: Item | undefined }>();
  private readonly changes = new Map<string, Item | null>();
  private committed = false;
  constructor(
    private readonly persistence: FinancePersistence = financePersistence(),
    private readonly table = tableName,
  ) {}

  async get<T extends Item = Item>(key: FinanceRecordKey): Promise<T | undefined> {
    if (this.committed) throw new Error('Finance unit of work is already committed.');
    const id = identity(key);
    const primaryKey = { PK: key.PK, SK: key.SK };
    if (!this.loaded.has(id))
      this.loaded.set(id, { key: primaryKey, item: await this.persistence.get(primaryKey) });
    if (this.changes.has(id))
      return structuredClone(this.changes.get(id) ?? undefined) as T | undefined;
    return structuredClone(this.loaded.get(id)!.item) as T | undefined;
  }
  async put(item: Item): Promise<void> {
    await this.get(item);
    this.changes.set(identity(item), structuredClone(item));
  }
  async delete(key: FinanceRecordKey): Promise<void> {
    await this.get(key);
    this.changes.set(identity(key), null);
  }
  private condition(item: Item | undefined) {
    if (!item) return { ConditionExpression: 'attribute_not_exists(PK)' };
    // Whole-row comparison also protects non-versioned identity locks and revision vectors.
    const entries = Object.entries(item).filter(([name]) => name !== 'PK' && name !== 'SK');
    return {
      ConditionExpression: [
        'attribute_exists(PK)',
        ...entries.map((_, i) => `#a${i} = :a${i}`),
      ].join(' AND '),
      ...(entries.length
        ? {
            ExpressionAttributeNames: Object.fromEntries(
              entries.map(([name], i) => [`#a${i}`, name]),
            ),
            ExpressionAttributeValues: Object.fromEntries(
              entries.map(([, value], i) => [`:a${i}`, value]),
            ),
          }
        : {}),
    };
  }
  async commit<T>(receipt: {
    key: FinanceRecordKey;
    fingerprint: string;
    result: T;
    expiresAt: number;
  }): Promise<T> {
    if (this.committed || !receipt.fingerprint || !Number.isSafeInteger(receipt.expiresAt))
      throw new Error('Invalid Finance commit receipt.');
    const existing = await this.get(receipt.key);
    if (existing) {
      if (existing.fingerprint !== receipt.fingerprint)
        throw new Error('Finance mutation identity conflict.');
      this.committed = true;
      return existing.result as T;
    }
    const canonical = [...this.changes].flatMap(([id, next]) => {
      const previous = this.loaded.get(id)!;
      if (isDeepStrictEqual(previous.item, next ?? undefined)) return [];
      const change = describeFinanceCanonicalChange(previous.key, previous.item, next ?? undefined);
      return change ? [change] : [];
    });
    const authorizationPartitions = financeAuthorizationPartitions(
      [...this.changes].map(([id, next]) => ({
        ...(this.loaded.get(id)!.item ? { before: this.loaded.get(id)!.item! } : {}),
        ...(next ? { after: next } : {}),
      })),
    );
    for (const [id, updated] of this.changes) {
      const previous = this.loaded.get(id)!;
      if (!updated || previous.key.SK !== 'META' || !isFinanceScopePartition(previous.key.PK))
        continue;
      const authorizationRevision = nextFinanceAuthorizationRevision(
        previous.item?.financeAuthorizationRevision,
        authorizationPartitions.has(previous.key.PK),
      );
      if (authorizationRevision !== undefined)
        this.changes.set(id, { ...updated, financeAuthorizationRevision: authorizationRevision });
      else if (updated.financeAuthorizationRevision !== undefined)
        throw new Error('Finance authorization revision requires canonical evidence.');
    }
    const partitions = new Set([
      ...canonical.map((change) => change.scopePK),
      ...authorizationPartitions,
    ]);
    for (const [id, next] of this.changes) {
      const before = this.loaded.get(id)!;
      if (
        before.key.SK === 'META' &&
        isFinanceScopePartition(before.key.PK) &&
        ((!next && before.item !== undefined) ||
          (next && Number(next.revision) !== Number(before.item?.revision ?? 0)))
      )
        partitions.add(before.key.PK);
    }
    const scopes = [];
    for (const PK of partitions) {
      const key = { PK, SK: 'META' };
      await this.get(key);
      const id = identity(key);
      const next = this.changes.get(id);
      // A brand-new scope has no pre-016 relationship rows. Do not infer this
      // negative coverage for an existing scope or a first write containing relationships.
      if (
        !this.loaded.get(id)!.item &&
        next?.revision === 1 &&
        PK !== 'FINANCE#CATALOG' &&
        next.refundRelationshipIndexVersion === undefined &&
        !canonical.some(
          (change) => change.scopePK === PK && change.collection === 'refundRelationships',
        )
      )
        this.changes.set(id, { ...next, refundRelationshipIndexVersion: 1 });
      scopes.push({
        PK,
        beforeRevision: Number(this.loaded.get(id)!.item?.revision ?? 0),
        afterRevision: Number(this.changes.get(id)?.revision),
      });
    }
    const publicationRecords = financePublicationJournalRecords(canonical, scopes);
    const publicationIds = publicationRecords.flatMap((row) =>
      typeof row.id === 'string' ? [row.id] : [],
    );
    for (const row of publicationRecords) {
      const present = await this.get(row);
      if (!present) await this.put(row);
      else if (
        [
          'finance-publication-deletion-v1',
          'finance-publication-account-deletion-v1',
          'finance-publication-account-birth-v1',
        ].includes(String(row.format)) &&
        present.format === row.format &&
        (present.transactionId ?? present.accountId) === (row.transactionId ?? row.accountId)
      )
        await this.put(row);
      else if (
        present.format !== row.format ||
        (present.id ?? present.publicationId) !== (row.id ?? row.publicationId)
      )
        throw new Error('Finance publication revision conflict.');
    }
    if (this.loaded.size > 100)
      throw new Error('Finance atomic write exceeds 100 touched records.');
    const writes: Write[] = [];
    for (const [id, { key, item }] of this.loaded) {
      const condition = this.condition(item);
      if (id === identity(receipt.key)) {
        writes.push({
          Put: {
            TableName: this.table,
            Item: {
              ...receipt.key,
              fingerprint: receipt.fingerprint,
              result: receipt.result,
              expiresAt: receipt.expiresAt,
            },
            ...condition,
          },
        });
      } else if (this.changes.has(id)) {
        const next = this.changes.get(id);
        writes.push(
          next
            ? { Put: { TableName: this.table, Item: next, ...condition } }
            : { Delete: { TableName: this.table, Key: key, ...condition } },
        );
      } else writes.push({ ConditionCheck: { TableName: this.table, Key: key, ...condition } });
    }
    if (Buffer.byteLength(JSON.stringify(writes)) > 3_500_000)
      throw new Error('Finance atomic write exceeds the request byte budget.');
    try {
      await this.persistence.write(writes);
    } catch (error) {
      // A lost response or competing identical retry may already have committed the receipt.
      const winner = await this.persistence.get(receipt.key);
      if (!winner || winner.fingerprint !== receipt.fingerprint) throw error;
      this.committed = true;
      await requestFinancePublication(publicationIds);
      return winner.result as T;
    }
    this.committed = true;
    await requestFinancePublication(publicationIds);
    return receipt.result;
  }
}
