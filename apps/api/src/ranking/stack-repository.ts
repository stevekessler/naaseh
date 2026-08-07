import { createHash } from 'node:crypto';
import { gzipSync, gunzipSync } from 'node:zlib';
import {
  applyFilteredPermutation,
  applySimpleMove,
  orderImplicitTail,
  type PersonalStackMove,
  type PersonalStackScope,
  type WorkReference,
} from '@naaseh/domain';
import { keys } from '../shared/keys.js';

export const MAX_COMPRESSED_STACK_CHUNK_BYTES = 250 * 1024;
const DEFAULT_REFERENCES_PER_CHUNK = 1_000;

const checksum = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: unknown) => JSON.stringify(value);

export interface StackOperationChunk {
  operationId: string;
  index: number;
  count: number;
  payload: Buffer;
  checksum: string;
}

export interface PreparedStackOperation {
  manifest: Record<string, unknown> & {
    id: string;
    version: number;
    affectedCount: number;
    affectedHash: string;
    chunkCount: number;
  };
  chunks: StackOperationChunk[];
}

function compressedReferenceChunks(
  operationId: string,
  references: readonly WorkReference[],
  targetCount = DEFAULT_REFERENCES_PER_CHUNK,
) {
  const chunks: StackOperationChunk[] = [];
  for (let offset = 0; offset < references.length; ) {
    let end = Math.min(references.length, offset + targetCount);
    let payload = gzipSync(canonical(references.slice(offset, end)));
    while (payload.byteLength > MAX_COMPRESSED_STACK_CHUNK_BYTES && end > offset + 1) {
      end = offset + Math.max(1, Math.floor((end - offset) / 2));
      payload = gzipSync(canonical(references.slice(offset, end)));
    }
    if (payload.byteLength > MAX_COMPRESSED_STACK_CHUNK_BYTES)
      throw new Error('A stack operation reference exceeds the compressed chunk limit.');
    chunks.push({
      operationId,
      index: chunks.length,
      count: end - offset,
      payload,
      checksum: checksum(payload),
    });
    offset = end;
  }
  return chunks;
}

export function prepareStackOperationRecords(input: {
  scope: PersonalStackScope;
  operation: Record<string, unknown> & {
    id: string;
    version: number;
    affectedCount: number;
  };
  affectedWork: WorkReference[];
}): PreparedStackOperation {
  if (input.operation.affectedCount !== input.affectedWork.length)
    throw new Error('Affected count does not match the operation payload.');
  const chunks = compressedReferenceChunks(input.operation.id, input.affectedWork);
  return {
    manifest: {
      ...input.operation,
      affectedHash: checksum(canonical(input.affectedWork)),
      chunkCount: chunks.length,
    },
    chunks,
  };
}

export function decodeStackOperationChunks(
  manifest: PreparedStackOperation['manifest'],
  chunks: StackOperationChunk[],
): WorkReference[] {
  if (chunks.length !== manifest.chunkCount) throw new Error('Operation chunk count is invalid.');
  const references: WorkReference[] = [];
  [...chunks]
    .sort((left, right) => left.index - right.index)
    .forEach((chunk, index) => {
      if (chunk.index !== index || checksum(chunk.payload) !== chunk.checksum)
        throw new Error('Operation chunks are noncontiguous or corrupt.');
      const decoded = JSON.parse(gunzipSync(chunk.payload).toString()) as WorkReference[];
      if (decoded.length !== chunk.count) throw new Error('Operation chunk count is corrupt.');
      references.push(...decoded);
    });
  if (
    references.length !== manifest.affectedCount ||
    checksum(canonical(references)) !== manifest.affectedHash
  )
    throw new Error('Operation aggregate hash or count is corrupt.');
  return references;
}

export function buildStackAcceptanceTransaction(input: {
  scope: PersonalStackScope;
  expectedVersion: number;
  prepared: PreparedStackOperation;
  expectedOwnerFeedSequence: number;
}) {
  const operation = input.prepared.manifest;
  const metadata = keys.personalStackMetadata(input.scope);
  return {
    TransactItems: [
      {
        Update: {
          Key: metadata,
          UpdateExpression: 'SET #version=:next, updatedAt=:updated ADD operationDepth :one',
          ConditionExpression: 'attribute_not_exists(#version) OR #version=:expected',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: {
            ':expected': input.expectedVersion,
            ':next': operation.version,
            ':updated': operation.acceptedAt,
            ':one': 1,
          },
        },
      },
      {
        Put: {
          Item: {
            ...keys.personalStackOperation(input.scope, operation.version, operation.id),
            data: operation,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      ...input.prepared.chunks.map((chunk) => ({
        Put: {
          Item: {
            ...keys.personalStackOperationChunk(
              input.scope,
              operation.version,
              operation.id,
              chunk.index,
            ),
            data: chunk,
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })),
      {
        Put: {
          Item: {
            ...keys.personalStackMutationReceipt(input.scope.userId, String(operation.mutationId)),
            data: {
              mutationId: operation.mutationId,
              status: operation.outcome,
              operationId: operation.id,
              version: operation.version,
            },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Put: {
          Item: {
            ...keys.personalStackAudit(input.scope, String(operation.acceptedAt), operation.id),
            data: { operationId: operation.id, outcome: operation.outcome },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
      {
        Update: {
          Key: keys.personalStackOwnerFeedCounter(input.scope.userId),
          UpdateExpression: 'SET sequence=:next',
          ConditionExpression: 'attribute_not_exists(sequence) OR sequence=:expected',
          ExpressionAttributeValues: {
            ':expected': input.expectedOwnerFeedSequence,
            ':next': input.expectedOwnerFeedSequence + 1,
          },
        },
      },
      {
        Put: {
          Item: {
            ...keys.personalStackOwnerFeedEntry(
              input.scope.userId,
              input.expectedOwnerFeedSequence + 1,
            ),
            data: { entityType: 'personalStackOperation', operationId: operation.id },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      },
    ],
  };
}

export interface PreparedStackSnapshot {
  scope: PersonalStackScope;
  generation: number;
  throughVersion: number;
  chunks: Array<{
    index: number;
    count: number;
    payload: Buffer;
    checksum: string;
  }>;
}

export function prepareStackSnapshot(input: {
  scope: PersonalStackScope;
  generation: number;
  throughVersion: number;
  workRefs: WorkReference[];
  targetUncompressedChunkBytes?: number;
}): PreparedStackSnapshot {
  const approximateReferenceBytes = 110;
  const targetCount = Math.max(
    1,
    Math.floor((input.targetUncompressedChunkBytes ?? 100_000) / approximateReferenceBytes),
  );
  const chunks = compressedReferenceChunks('snapshot', input.workRefs, targetCount).map(
    ({ index, count, payload, checksum: value }) => ({ index, count, payload, checksum: value }),
  );
  return { ...input, chunks };
}

export function validateStackSnapshot(snapshot: PreparedStackSnapshot): WorkReference[] {
  const references: WorkReference[] = [];
  [...snapshot.chunks]
    .sort((left, right) => left.index - right.index)
    .forEach((chunk, index) => {
      if (chunk.index !== index || checksum(chunk.payload) !== chunk.checksum)
        throw new Error('Snapshot chunks are noncontiguous or have an invalid checksum.');
      const decoded = JSON.parse(gunzipSync(chunk.payload).toString()) as WorkReference[];
      if (decoded.length !== chunk.count) throw new Error('Snapshot chunk count is corrupt.');
      references.push(...decoded);
    });
  return references;
}

export function paginateStackSnapshot(
  snapshot: PreparedStackSnapshot,
  input: { cursor?: string; limit: number },
) {
  const workRefs = validateStackSnapshot(snapshot);
  const offset = input.cursor ? Number.parseInt(input.cursor, 10) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > workRefs.length)
    throw new Error('Snapshot cursor is invalid.');
  const items = workRefs.slice(offset, offset + input.limit);
  const next = offset + items.length;
  return { items, nextCursor: next < workRefs.length ? String(next) : null };
}

function replay(order: WorkReference[], operations: Array<Record<string, unknown>>) {
  let current = [...order];
  for (const operation of operations) {
    if (operation.kind === 'filtered_permutation') {
      current = applyFilteredPermutation(
        current,
        operation as unknown as PersonalStackMove & { kind: 'filtered_permutation' },
      );
      continue;
    }
    const simple = operation as unknown as PersonalStackMove & { kind: 'simple_move' };
    current = applySimpleMove(current, simple);
  }
  return current;
}

export function compactStackSnapshot(input: {
  scope: PersonalStackScope;
  current: PreparedStackSnapshot;
  operations: Array<Record<string, unknown>>;
  implicitTail: WorkReference[];
  generation: number;
}) {
  const expectedVersion = input.current.throughVersion + 1;
  input.operations.forEach((operation, index) => {
    if (Number(operation.version) !== expectedVersion + index)
      throw new Error('Canonical operation versions must be contiguous for compaction.');
  });
  const order = replay(validateStackSnapshot(input.current), input.operations);
  const present = new Set(order.map((work) => canonical(work)));
  for (const work of orderImplicitTail(input.implicitTail))
    if (!present.has(canonical(work))) order.push(work);
  return prepareStackSnapshot({
    scope: input.scope,
    generation: input.generation,
    throughVersion: input.current.throughVersion + input.operations.length,
    workRefs: order,
  });
}

export function buildStackCompactionTransaction(input: {
  scope: PersonalStackScope;
  expectedStackVersion: number;
  expectedSnapshotGeneration: number;
  snapshot: PreparedStackSnapshot;
}) {
  return {
    TransactItems: [
      ...input.snapshot.chunks.map((chunk) => ({
        Put: {
          Item: {
            ...keys.personalStackSnapshotChunk(input.scope, input.snapshot.generation, chunk.index),
            data: { ...chunk, throughVersion: input.snapshot.throughVersion },
          },
          ConditionExpression: 'attribute_not_exists(PK)',
        },
      })),
      {
        Update: {
          Key: keys.personalStackMetadata(input.scope),
          UpdateExpression:
            'SET currentSnapshotGeneration=:next, snapshotThroughVersion=:through, operationDepth=:zero',
          ConditionExpression:
            '#version=:stackVersion AND (currentSnapshotGeneration=:expectedGeneration OR (attribute_not_exists(currentSnapshotGeneration) AND :expectedGeneration=:zero))',
          ExpressionAttributeNames: { '#version': 'version' },
          ExpressionAttributeValues: {
            ':stackVersion': input.expectedStackVersion,
            ':expectedGeneration': input.expectedSnapshotGeneration,
            ':next': input.snapshot.generation,
            ':through': input.snapshot.throughVersion,
            ':zero': 0,
          },
        },
      },
    ],
  };
}

export function recoverCanonicalStack(input: {
  scope: PersonalStackScope;
  baseMembership: WorkReference[];
  snapshot?: PreparedStackSnapshot;
  operations: Array<Record<string, unknown>>;
}) {
  input.operations.forEach((operation, index) => {
    if (Number(operation.version) !== index + 1)
      throw new Error('Canonical personal stack operation version gap detected.');
  });
  let rebuiltSnapshot = false;
  let base = input.baseMembership;
  let remaining = input.operations;
  if (input.snapshot) {
    try {
      base = validateStackSnapshot(input.snapshot);
      remaining = input.operations.filter(
        (operation) => Number(operation.version) > input.snapshot!.throughVersion,
      );
    } catch {
      rebuiltSnapshot = true;
    }
  }
  const workRefs = replay(base, remaining);
  return {
    rebuiltSnapshot,
    throughVersion: input.operations.at(-1)?.version ?? input.snapshot?.throughVersion ?? 0,
    workRefs,
  };
}
