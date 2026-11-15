import { csvImportChunkInputSchema } from '@naaseh/contracts';
import {
  readFinanceCachedData,
  withFinanceCacheLease,
  type FinanceCacheLease,
} from '../sync/finance-cache-access.js';
import Dexie, { type Table, type Transaction } from 'dexie';
import {
  createUlid,
  digestCsvBytes,
  type EntityType,
  type Mutation,
  type MutationOperation,
} from '@naaseh/domain';
import { decryptText, encryptText } from '../crypto/vault.js';
import { financeBootstrapDeviceKey } from './finance-device-key.js';
import {
  currentFinanceAccess,
  peekFinanceAccess,
} from '../features/finance/security/finance-access.js';
import {
  db,
  type EncryptedFinanceRecord,
  type EncryptedEntityRecord,
  type StoredMutation,
} from './database.js';

const associatedData = (entityType: string, id: string, version: number) =>
  `finance:${entityType}:${id}:v${version}`;

export async function financeDeviceKey(): Promise<CryptoKey> {
  return currentFinanceAccess().read(() => financeBootstrapDeviceKey());
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

export async function decryptFinanceRecord(
  record: EncryptedFinanceRecord,
  key: CryptoKey,
  lease?: FinanceCacheLease,
): Promise<unknown> {
  if (!lease) return readFinanceCachedData((current) => decryptFinanceRecord(record, key, current));
  return withFinanceCacheLease(lease, async (generation) => {
    if (record.cacheGeneration !== generation)
      throw new Error('Refresh Finance before using an unproven cached record.');
    const value = JSON.parse(
      await decryptText(
        record.value,
        key,
        associatedData(record.entityType, record.id, record.version),
      ),
    ) as unknown;
    return value && typeof value === 'object' && !Array.isArray(value)
      ? migrateLegacyFinanceValue(record.entityType, value as Record<string, unknown>)
      : value;
  });
}

/** Lazy, idempotent adaptation after decryption; encrypted pending mutations are never rewritten. */
export function migrateLegacyFinanceValue(
  entityType: string,
  value: Record<string, unknown>,
): Record<string, unknown> {
  if (entityType === 'financeBudget')
    return {
      ...value,
      activity:
        value.activity ??
        (value.status === 'active' || value.status === 'changed-since-reconciliation'
          ? 'active'
          : 'inactive'),
    };
  if (
    entityType === 'financeTaskLink' &&
    !value.targetType &&
    typeof value.budgetItemId === 'string'
  )
    return { ...value, targetType: 'budgetItem', targetId: value.budgetItemId };
  return { ...value };
}

/** Abort the active IndexedDB transaction when its original Finance visit ends. */
export async function commitFinanceWrite(
  tables: Table[],
  write: () => Promise<void>,
  signal?: AbortSignal,
) {
  return currentFinanceAccess().read(async (visitSignal) => {
    const check = () => {
      if (visitSignal.aborted) throw new Error('Unlock Finance to continue.');
    };
    check();
    let transaction: Transaction | undefined;
    const abort = () => transaction?.abort();
    visitSignal.addEventListener('abort', abort, { once: true });
    try {
      await db.transaction('rw', tables, async () => {
        transaction = Dexie.currentTransaction;
        check();
        await write();
        check();
      });
    } finally {
      visitSignal.removeEventListener('abort', abort);
    }
  }, signal);
}

/** A late or replaced replay never removes pending intent or commits a conflict. */
export async function commitFinanceReplayOutcome(input: {
  expected: StoredMutation;
  conflict?: EncryptedEntityRecord;
  signal: AbortSignal;
}): Promise<void> {
  if (
    !input.expected.entityType.startsWith('finance') ||
    (input.conflict &&
      (input.conflict.id !== input.expected.id ||
        input.conflict.entityType !== input.expected.entityType))
  )
    throw new Error('Invalid Finance replay outcome.');
  const access = currentFinanceAccess();
  if (access.requiresPin && !access.requestHeaders()['x-finance-unlock'])
    throw new Error('Connect and unlock Finance before acknowledging synchronized changes.');
  await commitFinanceWrite(
    [db.outbox, db.secureConflicts, db.secureFinanceRecords],
    async () => {
      const current = await db.outbox.get(input.expected.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(input.expected))
        throw new Error('Finance pending change changed. Retry synchronization.');
      if (input.conflict) await db.secureConflicts.put(input.conflict);
      // An acknowledged first creation is durable on the server. Retire its
      // unverified draft so the first protected pull can bootstrap cleanly.
      // Never consume a later edit, a canonical projection or rejected intent.
      const acknowledgedFirstCreation =
        !input.conflict &&
        ['financeBudget', 'financeReusableItem'].includes(input.expected.entityType) &&
        input.expected.operation === 'create' &&
        input.expected.baseVersion === 0;
      if (acknowledgedFirstCreation) {
        const draft = await db.secureFinanceRecords.get(input.expected.entityId);
        const pending = await db.outbox.where('entityId').equals(input.expected.entityId).toArray();
        if (
          draft?.entityType === input.expected.entityType &&
          draft.version === 1 &&
          draft.cacheGeneration === undefined &&
          pending.every((item) => item.id === input.expected.id)
        )
          await db.secureFinanceRecords.bulkDelete([draft.id]);
      }
      await db.outbox.delete(input.expected.id);
    },
    input.signal,
  );
}

export async function queueFinanceReceiptBytes(input: {
  ownerId: string;
  transactionId: string;
  bytes: Uint8Array;
  record: EncryptedFinanceRecord;
  mutation: StoredMutation;
}): Promise<void> {
  if (
    input.mutation.entityType !== 'financeReceipt' ||
    input.record.entityType !== 'financeReceipt' ||
    input.record.id !== input.mutation.entityId ||
    input.bytes.byteLength < 1 ||
    input.bytes.byteLength > 10_000_000
  )
    throw new Error('Invalid Finance receipt queue request.');
  return currentFinanceAccess().read(async (signal) => {
    const key = await financeDeviceKey();
    const parts: string[] = [];
    for (let offset = 0; offset < input.bytes.length; offset += 32_768)
      parts.push(String.fromCharCode(...input.bytes.subarray(offset, offset + 32_768)));
    const value = await encryptText(
      btoa(parts.join('')),
      key,
      associatedData('receiptBytes', input.record.id, 1),
    );
    try {
      await commitFinanceWrite(
        [db.secureFinancePendingBytes, db.secureFinanceRecords, db.outbox],
        async () => {
          await db.secureFinancePendingBytes.put({
            id: input.record.id,
            ownerId: input.ownerId,
            transactionId: input.transactionId,
            mutationId: input.mutation.id,
            version: 1,
            updatedAt: input.record.updatedAt,
            value,
          });
          await db.secureFinanceRecords.put(input.record);
          await db.outbox.add(input.mutation);
        },
        signal,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === 'QuotaExceededError' || error.name === 'UnknownError')
      )
        throw new Error(
          'Receipt bytes could not be durably queued. Free device storage and retry; the transaction was preserved.',
        );
      throw error;
    }
  });
}

export async function putFinanceRecordWithMutation(
  record: EncryptedFinanceRecord,
  mutation: StoredMutation,
  signal?: AbortSignal,
) {
  if (!currentFinanceAccess().canRead()) throw new Error('Unlock Finance to continue.');
  if (!mutation.entityType.startsWith('finance')) {
    throw new Error('Finance outbox mutation has an invalid entity type.');
  }
  await commitFinanceWrite(
    [db.secureFinanceRecords, db.outbox],
    async () => {
      await db.secureFinanceRecords.put(record);
      await db.outbox.add(mutation);
    },
    signal,
  );
}

export interface SavedCsvImportSummary {
  batchId: string;
  rowCount: number;
  complete: boolean;
  submissionPending?: true;
  partialRecoveryAvailable?: true;
}

const savedCsvChunkIdentity = csvImportChunkInputSchema
  .pick({ batchId: true, chunkIndex: true, finalChunk: true })
  .passthrough();

type CsvImportChunk = ReturnType<typeof csvImportChunkInputSchema.parse>;
export type SavedCsvRecoveryRow = Omit<CsvImportChunk['rows'][number], 'duplicateDisposition'>;
type SavedCsvPair = { record: EncryptedFinanceRecord; intents: StoredMutation[] };

const savedCsvIntentIdentity = ({
  id,
  entityId,
  entityType,
  operation,
  baseVersion,
  createdAt,
  payload,
}: StoredMutation) => ({ id, entityId, entityType, operation, baseVersion, createdAt, payload });

type SavedCsvRow = Pick<
  ReturnType<typeof csvImportChunkInputSchema.parse>['rows'][number],
  'ordinal' | 'description' | 'amountMinor' | 'transactedAt'
>;

export interface SavedCsvPage {
  offset: number;
  limit: number;
}

export interface SavedCsvImportPreview extends SavedCsvImportSummary, SavedCsvPage {
  rows: SavedCsvRow[];
}

export async function readSavedCsvImports(
  accountId: string,
  scopeKey: string,
): Promise<SavedCsvImportSummary[]> {
  return (await readSavedCsvBatches(accountId, scopeKey)).map(
    ({ batchId, rowCount, complete, submissionPending, partialRecoveryAvailable }) => ({
      batchId,
      rowCount,
      complete,
      ...(submissionPending ? { submissionPending } : {}),
      ...(partialRecoveryAvailable ? { partialRecoveryAvailable } : {}),
    }),
  );
}

export async function readSavedCsvImportPreview(
  accountId: string,
  scopeKey: string,
  batchId: string,
  page: SavedCsvPage = { offset: 0, limit: 100 },
): Promise<SavedCsvImportPreview | undefined> {
  const { offset, limit } = page;
  if (
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    offset >= 50_000 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  )
    throw new RangeError('Invalid saved CSV page.');
  const batch = (await readSavedCsvBatches(accountId, scopeKey, batchId, page))[0];
  if (!batch) return undefined;
  const { rowCount, complete, rows, submissionPending, partialRecoveryAvailable } = batch;
  return {
    batchId,
    rowCount,
    complete,
    rows,
    offset,
    limit,
    ...(submissionPending ? { submissionPending } : {}),
    ...(partialRecoveryAvailable ? { partialRecoveryAvailable } : {}),
  };
}

async function readSavedCsvBatches(
  accountId: string,
  scopeKey: string,
  selectedBatchId?: string,
  { offset, limit }: SavedCsvPage = { offset: 0, limit: 100 },
  collectRecovery = false,
): Promise<
  Array<SavedCsvImportPreview & { recoveryRows: SavedCsvRecoveryRow[]; pairs: SavedCsvPair[] }>
> {
  const access = currentFinanceAccess();
  return access.read(async (signal) => {
    if (scopeKey.startsWith('OWNER#') && scopeKey !== `OWNER#${access.ownerId}`) return [];
    const pairs = await db.transaction('r', [db.secureFinanceRecords, db.outbox], async () => {
      const records = await db.secureFinanceRecords.where('accountId').equals(accountId).toArray();
      return Promise.all(
        records
          .filter(
            (record) =>
              record.entityType === 'financeCsvChunk' &&
              (!selectedBatchId || record.id.startsWith(`${selectedBatchId}:`)) &&
              record.scopeKey === scopeKey &&
              record.cacheGeneration === undefined,
          )
          .map(async (record) => ({
            record,
            intents: await db.outbox.where('entityId').equals(record.id).toArray(),
          })),
      );
    });
    if (!pairs.length) return [];
    const key = await financeBootstrapDeviceKey();
    const batches = new Map<
      string,
      {
        chunks: Map<number, boolean>;
        ordinals: Set<number>;
        preview: SavedCsvRow[];
        recoveryRows: SavedCsvRecoveryRow[];
        pairs: SavedCsvPair[];
      }
    >();
    for (const { record, intents } of pairs) {
      signal.throwIfAborted();
      const [intent] = intents;
      if (
        intents.length !== 1 ||
        !intent ||
        intent.entityType !== 'financeTransaction' ||
        intent.operation !== 'commitCsvChunk' ||
        intent.baseVersion !== 0 ||
        record.version !== 1
      )
        throw new Error('Saved CSV data could not be verified.');

      const [staging, command] = await Promise.all([
        decryptText(
          record.value,
          key,
          associatedData(record.entityType, record.id, record.version),
        ),
        decryptText(intent.payload, key, `mutation:${intent.id}`),
      ]);
      if (staging !== command) throw new Error('Saved CSV data could not be verified.');
      const identity = savedCsvChunkIdentity.parse(JSON.parse(staging));
      const {
        batchId,
        chunkIndex,
        finalChunk,
        format,
        accountId: boundAccount,
        scopeKey: boundScope,
        ...data
      } = identity;
      if (
        record.id !== `${batchId}:${chunkIndex}` ||
        (format !== undefined &&
          (format !== 1 || boundAccount !== accountId || boundScope !== scopeKey)) ||
        (format === undefined && (boundAccount !== undefined || boundScope !== undefined))
      )
        throw new Error('Saved CSV data could not be verified.');

      const rows =
        format === 1
          ? csvImportChunkInputSchema.parse({ batchId, chunkIndex, finalChunk, ...data }).rows
          : csvImportChunkInputSchema.shape.rows.parse(
              Array.isArray(data.rows)
                ? data.rows.map((row: Record<string, unknown>) => ({
                    duplicateDisposition: 'not-suspected',
                    ...row,
                  }))
                : data.rows,
            );
      const batch = batches.get(batchId) ?? {
        chunks: new Map(),
        ordinals: new Set(),
        preview: [] as SavedCsvRow[],
        recoveryRows: [] as SavedCsvRecoveryRow[],
        pairs: [] as SavedCsvPair[],
      };
      if (selectedBatchId && batchId !== selectedBatchId)
        throw new Error('Saved CSV data could not be verified.');
      if (batch.chunks.has(chunkIndex)) throw new Error('Saved CSV data could not be verified.');
      batch.chunks.set(chunkIndex, finalChunk);
      if (collectRecovery) batch.pairs.push({ record, intents });
      for (const { ordinal, description, amountMinor, transactedAt, payee, memo } of rows) {
        if (batch.ordinals.has(ordinal)) throw new Error('Saved CSV data could not be verified.');
        batch.ordinals.add(ordinal);
        if (collectRecovery)
          batch.recoveryRows.push({
            ordinal,
            description,
            amountMinor,
            transactedAt,
            ...(payee === undefined ? {} : { payee }),
            ...(memo === undefined ? {} : { memo }),
          });
        else if (selectedBatchId)
          batch.preview.push({ ordinal, description, amountMinor, transactedAt });
      }
      batches.set(batchId, batch);
    }
    return Promise.all(
      [...batches].map(async ([batchId, { chunks, ordinals, preview, recoveryRows, pairs }]) => {
        const contiguous = Array.from({ length: chunks.size }, (_, index) =>
          chunks.has(index),
        ).every(Boolean);
        const last = chunks.size - 1;
        const finalMarkers = [...chunks.values()].filter(Boolean).length;
        const complete = contiguous && finalMarkers === 1 && chunks.get(last) === true;
        return {
          batchId,
          rowCount: ordinals.size,
          offset,
          limit,
          pairs,
          recoveryRows,
          rows: preview
            .sort((left, right) => left.ordinal - right.ordinal)
            .slice(offset, offset + limit),
          complete,
          ...(contiguous && finalMarkers === 0 ? { partialRecoveryAvailable: true as const } : {}),
          ...((await db.settings.get(savedCsvPlanKey(access.ownerId, accountId, batchId)))
            ? { submissionPending: true as const }
            : {}),
        };
      }),
    );
  });
}

const savedCsvPlanKey = (ownerId: string, accountId: string, batchId: string) =>
  `finance-csv-recovery:${ownerId}:${accountId}:${batchId}`;

/** An approved replacement stays encrypted locally until the server confirms every submitted row. */
export async function recoverSavedCsvImport(input: {
  accountId: string;
  scopeKey: string;
  batchId: string;
  resume: boolean;
  prepare: (rows: SavedCsvRecoveryRow[]) => Promise<CsvImportChunk[]>;
  dispatch: (chunks: CsvImportChunk[], signal: AbortSignal) => Promise<void>;
}): Promise<void> {
  const access = currentFinanceAccess();
  return access.read(async (signal) => {
    const { accountId, scopeKey, batchId } = input;
    const batch = (await readSavedCsvBatches(accountId, scopeKey, batchId, undefined, true))[0];
    if (!batch || (!batch.complete && !batch.partialRecoveryAvailable))
      throw new Error('Saved CSV chunks could not be verified as a continuous sequence.');
    const settingKey = savedCsvPlanKey(access.ownerId, accountId, batchId);
    const pairs = batch.pairs.sort((left, right) => left.record.id.localeCompare(right.record.id));
    const source = await digestCsvBytes(
      new TextEncoder().encode(
        JSON.stringify(
          pairs.map(({ record, intents }) => ({
            record,
            intents: intents.map(savedCsvIntentIdentity),
          })),
        ),
      ),
    );
    const key = await financeBootstrapDeviceKey();
    const unchanged = async () => {
      const records = await db.secureFinanceRecords.where('accountId').equals(accountId).toArray();
      const currentBatch = records.filter(
        (record) =>
          record.entityType === 'financeCsvChunk' &&
          record.scopeKey === scopeKey &&
          record.cacheGeneration === undefined &&
          record.id.startsWith(`${batchId}:`),
      );
      if (currentBatch.length !== pairs.length)
        throw new Error('Saved CSV data changed. Refresh and review it again.');
      for (const { record, intents } of pairs) {
        const current = await db.secureFinanceRecords.get(record.id);
        const pending = await db.outbox.where('entityId').equals(record.id).toArray();
        if (
          JSON.stringify(current) !== JSON.stringify(record) ||
          JSON.stringify(pending.map(savedCsvIntentIdentity)) !==
            JSON.stringify(intents.map(savedCsvIntentIdentity))
        )
          throw new Error('Saved CSV data changed. Refresh and review it again.');
      }
    };
    let stored = await db.settings.get(settingKey);
    if (Boolean(stored) !== input.resume)
      throw new Error('Saved CSV submission changed. Refresh Finance.');
    if (!stored) {
      const chunks = await input.prepare(
        batch.recoveryRows.sort((left, right) => left.ordinal - right.ordinal),
      );
      signal.throwIfAborted();
      const value = JSON.stringify(
        await encryptText(JSON.stringify({ source, chunks }), key, settingKey),
      );
      await commitFinanceWrite(
        [db.settings, db.outbox, db.secureFinanceRecords],
        async () => {
          await unchanged();
          if (await db.settings.get(settingKey))
            throw new Error('Saved CSV submission changed. Refresh Finance.');
          stored = { key: settingKey, value };
          await db.settings.put(stored);
        },
        signal,
      );
    }
    if (!stored) throw new Error('Saved CSV submission could not be prepared.');
    const plan = JSON.parse(await decryptText(JSON.parse(stored.value), key, settingKey)) as {
      source: string;
      chunks: unknown[];
    };
    if (plan.source !== source || !Array.isArray(plan.chunks) || !plan.chunks.length)
      throw new Error('Saved CSV data changed. Refresh and review it again.');
    const chunks = plan.chunks.map((chunk) => csvImportChunkInputSchema.parse(chunk));
    signal.throwIfAborted();
    await input.dispatch(chunks, signal);
    const expected = stored.value;
    await commitFinanceWrite(
      [db.settings, db.outbox, db.secureFinanceRecords],
      async () => {
        if ((await db.settings.get(settingKey))?.value !== expected)
          throw new Error('Saved CSV submission changed. Refresh Finance.');
        await unchanged();
        for (const { record, intents } of pairs) {
          await db.secureFinanceRecords.delete(record.id);
          await db.outbox.delete(intents[0]!.id);
        }
        await db.settings.delete(settingKey);
      },
      signal,
    );
  });
}

export async function applyFinancePull(input: {
  records: EncryptedFinanceRecord[];
  tombstones: Array<{ id: string; entityType: EntityType }>;
  signal?: AbortSignal;
  delivery?: {
    ownerId: string;
    previousValue?: string;
    value: string;
  };
}) {
  if (input.delivery && input.delivery.ownerId !== currentFinanceAccess().ownerId)
    throw new Error('Finance synchronization belongs to another account.');
  await commitFinanceWrite(
    [db.secureFinanceRecords, db.outbox, ...(input.delivery ? [db.settings] : [])],
    async () => {
      if (input.delivery) {
        const current = await db.settings.get(`finance-delivery:${input.delivery.ownerId}`);
        if (current?.value !== input.delivery.previousValue)
          throw new Error(
            'Finance synchronization changed in another tab. Retry from its checkpoint.',
          );
      }
      const pending = new Set(
        (await db.outbox.toArray())
          .filter((mutation: Mutation) => mutation.entityType.startsWith('finance'))
          .map((mutation) => mutation.entityId),
      );
      const kinds = new Map<string, string>();
      for (const incoming of [...input.records, ...input.tombstones]) {
        const current = await db.secureFinanceRecords.get(incoming.id);
        if (
          (current && current.entityType !== incoming.entityType) ||
          (kinds.has(incoming.id) && kinds.get(incoming.id) !== incoming.entityType)
        )
          throw new Error('Finance record type collision. Refresh before synchronizing.');
        kinds.set(incoming.id, incoming.entityType);
      }
      for (const tombstone of input.tombstones) {
        if (!pending.has(tombstone.id)) await db.secureFinanceRecords.delete(tombstone.id);
      }
      for (const record of input.records) {
        if (!pending.has(record.id)) await db.secureFinanceRecords.put(record);
      }
      if (input.delivery)
        await db.settings.put({
          key: `finance-delivery:${input.delivery.ownerId}`,
          value: input.delivery.value,
        });
    },
    input.signal,
  );
}

/** Revoke local reads and discard projections, retaining encrypted intent for authorized review. */
export async function purgeFinanceScope(scopeKey: string) {
  // markStale locks immediately, even when Require PIN is off; a normal visit lock is insufficient.
  const access = peekFinanceAccess();
  const invalidation = access?.markStale({ notifySecurityChange: true });
  const results = await Promise.allSettled([
    invalidation,
    db.transaction('rw', [db.secureFinanceRecords, db.settings, db.outbox], async () => {
      const rows = await db.secureFinanceRecords.where('scopeKey').equals(scopeKey).toArray();
      const pending = new Set(
        (await db.outbox.toArray())
          .filter((mutation) => mutation.entityType.startsWith('finance'))
          .map((mutation) => mutation.entityId),
      );
      await db.secureFinanceRecords.bulkDelete(
        rows.filter(({ id }) => !pending.has(id)).map(({ id }) => id),
      );
      // A known scope loss invalidates the whole proof closure. Retained encrypted
      // rows cannot inherit server authority from its obsolete cache generation.
      if (access) await db.settings.delete(`finance-delivery:${access.ownerId}`);
    }),
  ]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
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
  payloadValue?: unknown;
  operation?: Extract<MutationOperation, 'create' | 'update' | 'upsert' | 'archive'>;
  createdAt?: string;
  key?: CryptoKey;
}) {
  return currentFinanceAccess().read(async (signal) => {
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
      JSON.stringify(input.payloadValue ?? input.value),
      key,
      `mutation:${mutationId}`,
    );
    await putFinanceRecordWithMutation(
      record,
      {
        id: mutationId,
        entityId: input.entityId,
        entityType: input.entityType,
        operation: input.operation ?? (input.baseVersion === 0 ? 'create' : 'update'),
        baseVersion: input.baseVersion,
        payload,
        createdAt,
        attempts: 0,
      },
      signal,
    );
    return { mutationId, record };
  });
}

/** Atomically preserves a provisional/manual transaction and its replay command. */
export async function queueEncryptedManualTransaction(input: {
  transaction: Record<string, unknown> & { id: string; accountId: string };
  payloadValue?: unknown;
  scopeKey: string;
  createdAt?: string;
  key?: CryptoKey;
}) {
  return currentFinanceAccess().read(async (signal) => {
    const key = input.key ?? (await financeDeviceKey());
    const mutationId = createUlid();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const record = await encryptFinanceRecord({
      id: input.transaction.id,
      entityType: 'financeTransaction',
      scopeKey: input.scopeKey,
      accountId: input.transaction.accountId,
      occurredAt:
        typeof input.transaction.transactedAt === 'string'
          ? input.transaction.transactedAt
          : createdAt,
      lifecycle: 'active',
      version: 1,
      updatedAt: createdAt,
      value: input.transaction,
      key,
    });
    const payload = await encryptText(
      JSON.stringify(input.payloadValue ?? input.transaction),
      key,
      `mutation:${mutationId}`,
    );
    await putFinanceRecordWithMutation(
      record,
      {
        id: mutationId,
        entityId: input.transaction.id,
        entityType: 'financeTransaction',
        operation: 'create',
        baseVersion: 0,
        payload,
        createdAt,
        attempts: 0,
      },
      signal,
    );
    return { mutationId, record };
  });
}

/** Atomically retains a new budget and every selected account-link command in replay order. */
export async function queueEncryptedBudgetCreationPlan(input: {
  budgetId: string;
  groupId: string;
  scopeKey: string;
  value: Record<string, unknown>;
  accountIds: string[];
  createdAt?: string;
  key?: CryptoKey;
}) {
  if (
    input.value.id !== input.budgetId ||
    input.value.groupId !== input.groupId ||
    !input.accountIds.length ||
    input.accountIds.length > 50 ||
    new Set(input.accountIds).size !== input.accountIds.length
  )
    throw new Error('Selected Finance accounts must be unique.');
  return currentFinanceAccess().read(async (signal) => {
    const key = input.key ?? (await financeDeviceKey());
    const startedAt = new Date(input.createdAt ?? new Date().toISOString()).valueOf();
    if (!Number.isFinite(startedAt)) throw new Error('Finance creation time is invalid.');
    const definitions: Array<{
      entityId: string;
      entityType: OfflineBudgetEntityType;
      value: Record<string, unknown>;
      createdAt: string;
    }> = [
      {
        entityId: input.budgetId,
        entityType: 'financeBudget',
        value: input.value,
        createdAt: new Date(startedAt).toISOString(),
      },
      ...input.accountIds.map((accountId, index) => {
        const id = createUlid();
        return {
          entityId: id,
          entityType: 'financeBudgetAccountLink' as const,
          createdAt: new Date(startedAt + index + 1).toISOString(),
          value: {
            id,
            budgetId: input.budgetId,
            accountId,
            expectedBudgetVersion: index + 1,
            createdBy: 'pending',
            status: 'active',
            version: 1,
          },
        };
      }),
    ];
    const records: EncryptedFinanceRecord[] = [];
    const mutations: StoredMutation[] = [];
    let dependency: string | undefined;
    for (const definition of definitions) {
      const mutationId = createUlid();
      records.push(
        await encryptFinanceRecord({
          id: definition.entityId,
          entityType: definition.entityType,
          scopeKey: input.scopeKey,
          budgetId: input.budgetId,
          version: 1,
          updatedAt: definition.createdAt,
          value: definition.value,
          key,
        }),
      );
      mutations.push({
        id: mutationId,
        entityId: definition.entityId,
        entityType: definition.entityType,
        operation: 'create',
        baseVersion: 0,
        payload: await encryptText(JSON.stringify(definition.value), key, `mutation:${mutationId}`),
        createdAt: definition.createdAt,
        attempts: 0,
        ...(dependency ? { financeDependencyId: dependency } : {}),
      });
      dependency = mutationId;
    }
    await commitFinanceWrite(
      [db.secureFinanceRecords, db.outbox],
      async () => {
        for (const record of records) await db.secureFinanceRecords.put(record);
        for (const mutation of mutations) await db.outbox.add(mutation);
      },
      signal,
    );
    return { records, mutations };
  });
}

export async function readEncryptedBudgetProjection(budgetId: string, suppliedKey?: CryptoKey) {
  return readFinanceCachedData(async (lease) => {
    const key = suppliedKey ?? (await financeDeviceKey());
    const records = await db.secureFinanceRecords.where('budgetId').equals(budgetId).toArray();
    const values = await Promise.all(
      records.map(async (record) => ({
        entityType: record.entityType,
        id: record.id,
        version: record.version,
        value: await decryptFinanceRecord(record, key, lease),
      })),
    );
    return values.sort((left, right) => {
      const order = {
        financeBudget: 0,
        financeBudgetAccountLink: 1,
        financeBudgetItem: 2,
      } as Record<string, number>;
      return (
        (order[left.entityType] ?? 100) - (order[right.entityType] ?? 100) ||
        left.id.localeCompare(right.id)
      );
    });
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
  return currentFinanceAccess().read(async (signal) => {
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
    await putFinanceRecordWithMutation(
      record,
      {
        id: mutationId,
        entityId: input.entityId,
        entityType: 'financeReusableItem',
        operation: input.baseVersion === 0 ? 'create' : 'update',
        baseVersion: input.baseVersion,
        payload,
        createdAt,
        attempts: 0,
      },
      signal,
    );
    return { mutationId, record };
  });
}

/** Refund proposals stay encrypted and ordered behind their canonical credit transaction. */
export async function queueEncryptedRefundRelationshipMutation(input: {
  relationshipId: string;
  refundTransactionId: string;
  scopeKey: `OWNER#${string}`;
  baseVersion: number;
  value: unknown;
  remove?: boolean;
  createdAt?: string;
  key?: CryptoKey;
}) {
  return currentFinanceAccess().read(async (signal) => {
    const key = input.key ?? (await financeDeviceKey());
    const mutationId = createUlid();
    const createdAt = input.createdAt ?? new Date().toISOString();
    const record = await encryptFinanceRecord({
      id: input.relationshipId,
      entityType: 'financeRefundRelationship',
      scopeKey: input.scopeKey,
      accountId: input.refundTransactionId,
      version: Math.max(1, input.baseVersion + 1),
      updatedAt: createdAt,
      value: input.value,
      key,
      lifecycle: input.remove ? 'removed' : 'active',
    });
    const payload = await encryptText(JSON.stringify(input.value), key, `mutation:${mutationId}`);
    await putFinanceRecordWithMutation(
      record,
      {
        id: mutationId,
        entityId: input.relationshipId,
        entityType: 'financeRefundRelationship',
        operation: input.remove ? 'delete' : input.baseVersion === 0 ? 'create' : 'update',
        baseVersion: input.baseVersion,
        payload,
        createdAt,
        attempts: 0,
        financeDependencyId: input.refundTransactionId,
      },
      signal,
    );
    return { mutationId, record };
  });
}
