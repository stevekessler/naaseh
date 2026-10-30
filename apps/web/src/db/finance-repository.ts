import { createUlid, type EntityType, type Mutation, type MutationOperation } from '@naaseh/domain';
import { decryptText, encryptText } from '../crypto/vault.js';
import { createDeviceKey } from '../crypto/vault.js';
import { clearFinanceSearchIndexes } from '../search/finance-index-lifecycle.js';
import Dexie from 'dexie';
import { db, type EncryptedFinanceRecord, type StoredMutation } from './database.js';

const associatedData = (entityType: string, id: string, version: number) =>
  `finance:${entityType}:${id}:v${version}`;

export async function financeDeviceKey(): Promise<CryptoKey> {
  return Dexie.ignoreTransaction(async () => {
    const stored = await db.cryptoKeys.get('device');
    if (stored) return stored.key;
    const candidate = await createDeviceKey();
    return db.transaction('rw', db.cryptoKeys, async () => {
      const winner = await db.cryptoKeys.get('device');
      if (winner) return winner.key;
      await db.cryptoKeys.add({ id: 'device', key: candidate });
      return candidate;
    });
  });
}

export async function encryptFinanceRecord(input: {
  id: string;
  entityType: string;
  scopeKey: string;
  version: number;
  updatedAt: string;
  value: unknown;
  key: CryptoKey;
  accountId?: string;
  budgetId?: string;
  occurredAt?: string;
  lifecycle?: string;
}): Promise<EncryptedFinanceRecord> {
  return {
    id: input.id,
    entityType: input.entityType,
    scopeKey: input.scopeKey,
    version: input.version,
    updatedAt: input.updatedAt,
    value: await encryptText(
      JSON.stringify(input.value),
      input.key,
      associatedData(input.entityType, input.id, input.version),
    ),
    ...(input.accountId ? { accountId: input.accountId } : {}),
    ...(input.budgetId ? { budgetId: input.budgetId } : {}),
    ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    ...(input.lifecycle ? { lifecycle: input.lifecycle } : {}),
  };
}

export async function decryptFinanceRecord(record: EncryptedFinanceRecord, key: CryptoKey) {
  return JSON.parse(
    await decryptText(
      record.value,
      key,
      associatedData(record.entityType, record.id, record.version),
    ),
  ) as unknown;
}

export async function putFinanceRecordWithMutation(
  record: EncryptedFinanceRecord,
  mutation: StoredMutation,
) {
  if (!mutation.entityType.startsWith('finance')) {
    throw new Error('Finance outbox mutation has an invalid entity type.');
  }
  await db.transaction('rw', db.secureFinanceRecords, db.outbox, async () => {
    await db.secureFinanceRecords.put(record);
    await db.outbox.add(mutation);
  });
}

export async function applyFinancePull(input: {
  records: EncryptedFinanceRecord[];
  tombstones: Array<{ id: string; entityType: EntityType }>;
}) {
  if (input.tombstones.length) clearFinanceSearchIndexes();
  await db.transaction('rw', db.secureFinanceRecords, db.outbox, async () => {
    const pending = new Set(
      (await db.outbox.toArray())
        .filter((mutation: Mutation) => mutation.entityType.startsWith('finance'))
        .map((mutation) => mutation.entityId),
    );
    for (const tombstone of input.tombstones) {
      await db.secureFinanceRecords.delete(tombstone.id);
      await db.outbox.where('entityId').equals(tombstone.id).delete();
    }
    const deleted = new Set(input.tombstones.map(({ id }) => id));
    for (const record of input.records) {
      if (!deleted.has(record.id) && !pending.has(record.id))
        await db.secureFinanceRecords.put(record);
    }
  });
}

export async function purgeFinanceScope(scopeKey: string) {
  const rows = await db.secureFinanceRecords.where('scopeKey').equals(scopeKey).toArray();
  const ids = rows.map(({ id }) => id);
  await db.transaction('rw', db.secureFinanceRecords, db.outbox, async () => {
    await db.secureFinanceRecords.bulkDelete(ids);
    if (ids.length) await db.outbox.where('entityId').anyOf(ids).delete();
  });
}

export type OfflineBudgetEntityType =
  | 'financeBudget'
  | 'financeBudgetAccountLink'
  | 'financeBudgetItem';

/** Atomically preserves an encrypted optimistic budget projection and its encrypted outbox command. */
export async function queueEncryptedBudgetMutation(input: {
  entityId: string;
  entityType: OfflineBudgetEntityType;
  budgetId: string;
  scopeKey: string;
  baseVersion: number;
  value: unknown;
  command?: unknown;
  operation?: Extract<MutationOperation, 'create' | 'update' | 'upsert' | 'archive'>;
  createdAt?: string;
  key?: CryptoKey;
}) {
  const key = input.key ?? (await financeDeviceKey());
  const mutationId = createUlid();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const version = Math.max(1, input.baseVersion + 1);
  const record = await encryptFinanceRecord({
    id: input.entityId,
    entityType: input.entityType,
    scopeKey: input.scopeKey,
    budgetId: input.budgetId,
    version,
    updatedAt: createdAt,
    value: input.value,
    key,
  });
  const payload = await encryptText(
    JSON.stringify(input.command ?? input.value),
    key,
    `mutation:${mutationId}`,
  );
  const parent =
    input.entityType !== 'financeBudget'
      ? await db.secureFinanceRecords.get(input.budgetId)
      : undefined;
  let updatedParent: EncryptedFinanceRecord | undefined;
  if (parent) {
    if (parent.version !== input.baseVersion)
      throw new Error('The saved budget changed. Reopen it and try again.');
    const value = (await decryptFinanceRecord(parent, key)) as Record<string, unknown>;
    updatedParent = await encryptFinanceRecord({
      ...parent,
      version: input.baseVersion + 1,
      updatedAt: createdAt,
      value: { ...value, version: input.baseVersion + 1 },
      key,
    });
  }
  await db.transaction('rw', db.secureFinanceRecords, db.outbox, async () => {
    if (parent && (await db.secureFinanceRecords.get(parent.id))?.version !== parent.version)
      throw new Error('The saved budget changed. Reopen it and try again.');
    if (updatedParent) await db.secureFinanceRecords.put(updatedParent);
    await db.secureFinanceRecords.put(record);
    await db.outbox.add({
      id: mutationId,
      entityId: input.entityId,
      entityType: input.entityType,
      operation: input.operation ?? (input.baseVersion === 0 ? 'create' : 'update'),
      baseVersion: input.baseVersion,
      payload,
      createdAt,
      attempts: 0,
    });
  });
  return { mutationId, record };
}

export async function readEncryptedBudgetProjection(budgetId: string, suppliedKey?: CryptoKey) {
  const key = suppliedKey ?? (await financeDeviceKey());
  const records = await db.secureFinanceRecords.where('budgetId').equals(budgetId).toArray();
  const values = await Promise.all(
    records.map(async (record) => ({
      entityType: record.entityType,
      id: record.id,
      version: record.version,
      value: await decryptFinanceRecord(record, key),
    })),
  );
  return values.sort((left, right) => {
    const order = { financeBudget: 0, financeBudgetAccountLink: 1, financeBudgetItem: 2 } as Record<
      string,
      number
    >;
    return (
      (order[left.entityType] ?? 100) - (order[right.entityType] ?? 100) ||
      left.id.localeCompare(right.id)
    );
  });
}

/** Reusable sources are group-scoped and queue independently from any one budget copy. */
export async function queueEncryptedReusableItemMutation(input: {
  entityId: string;
  scopeKey: string;
  baseVersion: number;
  value: unknown;
  createdAt?: string;
  key?: CryptoKey;
}) {
  const key = input.key ?? (await financeDeviceKey());
  const mutationId = createUlid();
  const createdAt = input.createdAt ?? new Date().toISOString();
  const record = await encryptFinanceRecord({
    id: input.entityId,
    entityType: 'financeReusableItem',
    scopeKey: input.scopeKey,
    version: Math.max(1, input.baseVersion + 1),
    updatedAt: createdAt,
    value: input.value,
    key,
  });
  const payload = await encryptText(JSON.stringify(input.value), key, `mutation:${mutationId}`);
  await putFinanceRecordWithMutation(record, {
    id: mutationId,
    entityId: input.entityId,
    entityType: 'financeReusableItem',
    operation: input.baseVersion === 0 ? 'create' : 'update',
    baseVersion: input.baseVersion,
    payload,
    createdAt,
    attempts: 0,
  });
  return { mutationId, record };
}
