import {
  QueryCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';
import {
  orderImplicitTail,
  personalStackScopeSchema,
  type PersonalStackScope,
  type WorkReference,
} from '@naaseh/domain';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import { keys } from '../shared/keys.js';
import {
  buildStackCompactionTransaction,
  compactStackSnapshot,
  decodeStackOperationChunks,
  prepareStackSnapshot,
  validateStackSnapshot,
  type PreparedStackOperation,
  type PreparedStackSnapshot,
  type StackOperationChunk,
} from './stack-repository.js';

const MAX_COMPACTION_ATTEMPTS = 3;

export interface StackCompactionMetadata {
  version: number;
  currentSnapshotGeneration: number;
  snapshotThroughVersion: number;
  operationDepth: number;
}

export interface StackCompactionRepository {
  loadMetadata(scope: PersonalStackScope): Promise<StackCompactionMetadata | undefined>;
  loadMembership(scope: PersonalStackScope): Promise<WorkReference[]>;
  loadSnapshot(
    scope: PersonalStackScope,
    generation: number,
    throughVersion: number,
  ): Promise<PreparedStackSnapshot | undefined>;
  loadCanonicalOperations(
    scope: PersonalStackScope,
    throughVersion: number,
  ): Promise<Array<Record<string, unknown>>>;
  commitSnapshot(input: {
    scope: PersonalStackScope;
    metadata: StackCompactionMetadata;
    snapshot: PreparedStackSnapshot;
  }): Promise<boolean>;
}

export type StackCompactionResult =
  | { status: 'missing'; attempts: number }
  | { status: 'already_compacted'; attempts: number; throughVersion: number; generation: number }
  | { status: 'compacted'; attempts: number; throughVersion: number; generation: number };

function nonnegativeInteger(value: unknown, name: string) {
  const parsed = Number(value ?? 0);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error(`Personal stack ${name} is invalid.`);
  return parsed;
}

function operationVersion(operation: Record<string, unknown>) {
  return nonnegativeInteger(operation.version, 'operation version');
}

function assertCanonicalContinuity(
  operations: Array<Record<string, unknown>>,
  throughVersion: number,
) {
  if (operations.length !== throughVersion)
    throw new Error('Canonical personal stack operation log has a version gap.');
  operations.forEach((operation, index) => {
    if (operationVersion(operation) !== index + 1)
      throw new Error('Canonical personal stack operation log has a version gap.');
  });
}

function currentSnapshotIsComplete(
  metadata: StackCompactionMetadata,
  snapshot: PreparedStackSnapshot | undefined,
) {
  if (!snapshot || metadata.currentSnapshotGeneration === 0) return false;
  if (snapshot.throughVersion !== metadata.version) return false;
  try {
    validateStackSnapshot(snapshot);
    return true;
  } catch {
    return false;
  }
}

export function createStackCompactor(
  repository: StackCompactionRepository,
  options: { maxAttempts?: number } = {},
) {
  const maxAttempts = options.maxAttempts ?? MAX_COMPACTION_ATTEMPTS;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new Error('Compaction attempts must be a positive integer.');

  return async function compact(scopeInput: PersonalStackScope): Promise<StackCompactionResult> {
    const scope = personalStackScopeSchema.parse(scopeInput);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const metadata = await repository.loadMetadata(scope);
      if (!metadata) return { status: 'missing', attempts: attempt };
      const [membership, loadedSnapshot, operations] = await Promise.all([
        repository.loadMembership(scope),
        metadata.currentSnapshotGeneration
          ? repository
              .loadSnapshot(
                scope,
                metadata.currentSnapshotGeneration,
                metadata.snapshotThroughVersion,
              )
              .catch(() => undefined)
          : Promise.resolve(undefined),
        repository.loadCanonicalOperations(scope, metadata.version),
      ]);
      assertCanonicalContinuity(operations, metadata.version);

      if (metadata.operationDepth === 0 && currentSnapshotIsComplete(metadata, loadedSnapshot))
        return {
          status: 'already_compacted',
          attempts: attempt,
          throughVersion: metadata.version,
          generation: metadata.currentSnapshotGeneration,
        };

      let baseSnapshot = loadedSnapshot;
      if (baseSnapshot) {
        try {
          validateStackSnapshot(baseSnapshot);
          if (baseSnapshot.throughVersion > metadata.version)
            throw new Error('Snapshot pointer exceeds the canonical stack version.');
        } catch {
          baseSnapshot = undefined;
        }
      }
      if (!baseSnapshot)
        baseSnapshot = prepareStackSnapshot({
          scope,
          generation: 0,
          throughVersion: 0,
          workRefs: orderImplicitTail(membership),
        });

      const nextGeneration = metadata.currentSnapshotGeneration + 1;
      const snapshot = compactStackSnapshot({
        scope,
        current: baseSnapshot,
        operations: operations.filter(
          (operation) => operationVersion(operation) > baseSnapshot.throughVersion,
        ),
        implicitTail: membership,
        generation: nextGeneration,
      });
      if (snapshot.throughVersion !== metadata.version)
        throw new Error('Compaction did not consume the complete canonical operation log.');
      validateStackSnapshot(snapshot);

      if (await repository.commitSnapshot({ scope, metadata, snapshot }))
        return {
          status: 'compacted',
          attempts: attempt,
          throughVersion: snapshot.throughVersion,
          generation: snapshot.generation,
        };
    }
    throw new Error('Personal stack changed repeatedly during compaction; retry later.');
  };
}

type StoredItem = { PK?: unknown; SK?: unknown; data?: unknown } & Record<string, unknown>;

async function queryPartition(scope: PersonalStackScope, prefix: string) {
  const items: StoredItem[] = [];
  let cursor: Record<string, unknown> | undefined;
  do {
    const response = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'PK=:pk AND begins_with(SK,:prefix)',
        ExpressionAttributeValues: {
          ':pk': keys.personalStackMetadata(scope).PK,
          ':prefix': prefix,
        },
        ConsistentRead: true,
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    items.push(...((response.Items ?? []) as StoredItem[]));
    cursor = response.LastEvaluatedKey;
  } while (cursor);
  return items;
}

function storedData(item: StoredItem) {
  if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data))
    throw new Error('Personal stack record data is invalid.');
  return item.data as Record<string, unknown>;
}

export const dynamoStackCompactionRepository: StackCompactionRepository = {
  async loadMetadata(scope) {
    const [item] = await queryPartition(scope, 'META');
    if (!item || item.SK !== 'META') return undefined;
    const data =
      item.data && typeof item.data === 'object' && !Array.isArray(item.data)
        ? (item.data as Record<string, unknown>)
        : item;
    return {
      version: nonnegativeInteger(data.version, 'version'),
      currentSnapshotGeneration: nonnegativeInteger(
        data.currentSnapshotGeneration,
        'snapshot generation',
      ),
      snapshotThroughVersion: nonnegativeInteger(data.snapshotThroughVersion, 'snapshot version'),
      operationDepth: nonnegativeInteger(data.operationDepth, 'operation depth'),
    };
  },

  async loadMembership(scope) {
    const rows = await queryPartition(scope, 'MEMBERSHIP#');
    return rows.flatMap((row) => {
      const data = storedData(row);
      if (data.active === false) return [];
      return [
        {
          workType: data.workType,
          workId: data.workId,
          membershipEpoch: data.membershipEpoch,
        } as WorkReference,
      ];
    });
  },

  async loadSnapshot(scope, generation, throughVersion) {
    const prefix = `SNAPSHOT#${String(generation).padStart(12, '0')}#CHUNK#`;
    const rows = await queryPartition(scope, prefix);
    if (!rows.length) return undefined;
    return {
      scope,
      generation,
      throughVersion,
      chunks: rows.map((row) => {
        const data = storedData(row);
        if (nonnegativeInteger(data.throughVersion, 'snapshot version') !== throughVersion)
          throw new Error('Snapshot chunks disagree with the active snapshot pointer.');
        return {
          index: nonnegativeInteger(data.index, 'snapshot chunk index'),
          count: nonnegativeInteger(data.count, 'snapshot chunk count'),
          payload: Buffer.from(data.payload as Uint8Array),
          checksum: String(data.checksum),
        };
      }),
    };
  },

  async loadCanonicalOperations(scope, throughVersion) {
    const rows = await queryPartition(scope, 'OP#');
    const manifests = new Map<string, PreparedStackOperation['manifest']>();
    const chunks = new Map<string, StackOperationChunk[]>();
    for (const row of rows) {
      const sk = String(row.SK ?? '');
      const manifestMatch = /^OP#(\d{12})#([^#]+)$/u.exec(sk);
      if (manifestMatch && Number(manifestMatch[1]) <= throughVersion) {
        manifests.set(`${manifestMatch[1]}#${manifestMatch[2]}`, {
          ...storedData(row),
          id: manifestMatch[2]!,
          version: Number(manifestMatch[1]),
        } as PreparedStackOperation['manifest']);
        continue;
      }
      const chunkMatch = /^OP#(\d{12})#([^#]+)#CHUNK#(\d{12})$/u.exec(sk);
      if (!chunkMatch || Number(chunkMatch[1]) > throughVersion) continue;
      const key = `${chunkMatch[1]}#${chunkMatch[2]}`;
      const data = storedData(row);
      chunks.set(key, [
        ...(chunks.get(key) ?? []),
        {
          operationId: chunkMatch[2]!,
          index: nonnegativeInteger(data.index, 'operation chunk index'),
          count: nonnegativeInteger(data.count, 'operation chunk count'),
          payload: Buffer.from(data.payload as Uint8Array),
          checksum: String(data.checksum),
        },
      ]);
    }
    return [...manifests.entries()]
      .sort(([, left], [, right]) => left.version - right.version)
      .map(([key, manifest]) => {
        const affectedWork = decodeStackOperationChunks(manifest, chunks.get(key) ?? []);
        return {
          ...manifest,
          ...(manifest.kind === 'filtered_permutation' ? { affectedWork } : {}),
        };
      });
  },

  async commitSnapshot({ scope, metadata, snapshot }) {
    const transaction = buildStackCompactionTransaction({
      scope,
      expectedStackVersion: metadata.version,
      expectedSnapshotGeneration: metadata.currentSnapshotGeneration,
      snapshot,
    });
    const transactItems = transaction.TransactItems.map((item) => {
      if ('Put' in item) return { Put: { ...item.Put, TableName: tableName } };
      return { Update: { ...item.Update, TableName: tableName } };
    }) as NonNullable<TransactWriteCommandInput['TransactItems']>;
    if (transactItems.length > 100)
      throw new Error('Personal stack snapshot exceeds the DynamoDB transaction limit.');
    try {
      await dynamodb.send(new TransactWriteCommand({ TransactItems: transactItems }));
      return true;
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === 'ConditionalCheckFailedException' || name === 'TransactionCanceledException')
        return false;
      throw error;
    }
  },
};

export const compactPersonalStack = createStackCompactor(dynamoStackCompactionRepository);

export async function handler(event: { scope: PersonalStackScope; actor?: unknown }) {
  const scope = personalStackScopeSchema.parse(event.scope);
  const actor = event.actor as
    | { id: string; role: 'admin' | 'user'; active: boolean; groupIds: string[] }
    | undefined;
  if (!actor || actor.id !== scope.userId || !actor.active)
    throw new Error('Compaction requires the active stack owner context.');
  const { compactionMembershipRepository } = await import('./runtime.js');
  return createStackCompactor(compactionMembershipRepository(actor))(scope);
}
