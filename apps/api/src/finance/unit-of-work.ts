import {
  GetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';

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
    try {
      await this.persistence.write(writes);
    } catch (error) {
      // A lost response or competing identical retry may already have committed the receipt.
      const winner = await this.persistence.get(receipt.key);
      if (!winner || winner.fingerprint !== receipt.fingerprint) throw error;
      this.committed = true;
      return winner.result as T;
    }
    this.committed = true;
    return receipt.result;
  }
}
