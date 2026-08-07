import { describe, expect, it } from 'vitest';
import {
  MAX_COMPRESSED_STACK_CHUNK_BYTES,
  buildStackAcceptanceTransaction,
  buildStackCompactionTransaction,
  compactStackSnapshot,
  decodeStackOperationChunks,
  paginateStackSnapshot,
  prepareStackOperationRecords,
  prepareStackSnapshot,
  recoverCanonicalStack,
  validateStackSnapshot,
} from '../../apps/api/src/ranking/stack-repository.js';

const scope = { userId: 'user-a', scopeType: 'overall' as const };
const operationId = '01K00000000000000000000900';
const mutationId = '01K00000000000000000000901';

const workRef = (index: number, workType: 'task' | 'list' = 'task') => ({
  workType,
  workId: String(index + 1).padStart(26, '0'),
  membershipEpoch: `PUBLIC:${String(index + 1).padStart(20, '0')}`,
});

const simpleMove = (version: number, moved: number, following: number) => ({
  id: `01K${String(version).padStart(23, '0')}`,
  mutationId: `01M${String(version).padStart(23, '0')}`,
  userId: scope.userId,
  scopeType: scope.scopeType,
  baseVersion: version - 1,
  version,
  kind: 'simple_move' as const,
  movedWork: workRef(moved),
  afterWork: workRef(following),
  affectedCount: 1,
  sourceClientId: 'client-a',
  acceptedAt: `2026-08-05T12:00:${String(version).padStart(2, '0')}.000Z`,
  outcome: 'applied' as const,
});

describe('personal stack repository', () => {
  it('encodes a large filtered operation into contiguous checksum-protected chunks below 250 KB', () => {
    const affectedWork = Array.from({ length: 50_000 }, (_, index) =>
      workRef(index, index % 4 === 0 ? 'list' : 'task'),
    );
    const prepared = prepareStackOperationRecords({
      scope,
      operation: {
        id: operationId,
        mutationId,
        userId: scope.userId,
        scopeType: scope.scopeType,
        baseVersion: 0,
        version: 1,
        kind: 'filtered_permutation',
        movedWork: affectedWork.at(-1)!,
        destinationIndex: 0,
        filterBasis: { urgencies: ['high', 'critical'] },
        affectedCount: affectedWork.length,
        sourceClientId: 'client-a',
        acceptedAt: '2026-08-05T12:00:00.000Z',
        outcome: 'pending_compaction',
      },
      affectedWork,
    });

    expect(prepared.manifest.affectedCount).toBe(50_000);
    expect(prepared.manifest.chunkCount).toBe(prepared.chunks.length);
    expect(prepared.manifest.affectedHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.chunks.map((chunk) => chunk.index)).toEqual(
      prepared.chunks.map((_, index) => index),
    );
    for (const chunk of prepared.chunks) {
      expect(chunk.payload.byteLength).toBeLessThanOrEqual(MAX_COMPRESSED_STACK_CHUNK_BYTES);
      expect(chunk.checksum).toMatch(/^[a-f0-9]{64}$/u);
      expect(chunk.count).toBeGreaterThan(0);
    }
    expect(decodeStackOperationChunks(prepared.manifest, prepared.chunks)).toEqual(affectedWork);
  });

  it('accepts metadata, manifest, chunks, receipt, private audit, and owner feed atomically', () => {
    const prepared = prepareStackOperationRecords({
      scope,
      operation: {
        ...simpleMove(1, 2, 0),
        id: operationId,
        mutationId,
      },
      affectedWork: [workRef(2)],
    });
    const transaction = buildStackAcceptanceTransaction({
      scope,
      expectedVersion: 0,
      prepared,
      expectedOwnerFeedSequence: 7,
    });
    const items = transaction.TransactItems ?? [];

    expect(items.some((item) => item.Update?.Key?.SK === 'META')).toBe(true);
    expect(
      items.some(
        (item) =>
          item.Update?.ConditionExpression?.includes(':expected') &&
          item.Update?.ExpressionAttributeValues?.[':expected'] === 0,
      ),
    ).toBe(true);
    expect(items.some((item) => String(item.Put?.Item?.SK).startsWith('OP#'))).toBe(true);
    expect(items.some((item) => item.Put?.Item?.SK === `MUTATION#${mutationId}`)).toBe(true);
    expect(items.some((item) => String(item.Put?.Item?.SK).startsWith('AUDIT#'))).toBe(true);
    expect(items.some((item) => item.Update?.Key?.PK === 'FEED#OWNER#user-a')).toBe(true);
    expect(items.some((item) => String(item.Put?.Item?.PK) === 'FEED#OWNER#user-a')).toBe(true);
    expect(
      items.every(
        (item) =>
          !String(item.Put?.Item?.PK ?? item.Update?.Key?.PK ?? '').includes('PUBLIC') &&
          !String(item.Put?.Item?.PK ?? item.Update?.Key?.PK ?? '').includes('GROUP#'),
      ),
    ).toBe(true);
  });

  it('builds immutable checksummed snapshot chunks and paginates them exactly once in order', () => {
    const expected = Array.from({ length: 517 }, (_, index) => workRef(index));
    const snapshot = prepareStackSnapshot({
      scope,
      generation: 3,
      throughVersion: 12,
      workRefs: expected,
      targetUncompressedChunkBytes: 1_500,
    });

    expect(snapshot.chunks.length).toBeGreaterThan(1);
    expect(validateStackSnapshot(snapshot)).toEqual(expected);

    const observed: typeof expected = [];
    let cursor: string | undefined;
    do {
      const page = paginateStackSnapshot(snapshot, { cursor, limit: 73 });
      observed.push(...page.items);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);

    expect(observed).toEqual(expected);
    expect(new Set(observed.map((item) => `${item.workType}:${item.workId}`)).size).toBe(517);
  });

  it('compacts a snapshot plus contiguous canonical operations before advancing its pointer', () => {
    const current = prepareStackSnapshot({
      scope,
      generation: 1,
      throughVersion: 0,
      workRefs: [workRef(0), workRef(1), workRef(2)],
    });
    const compacted = compactStackSnapshot({
      scope,
      current,
      operations: [simpleMove(1, 2, 0), simpleMove(2, 1, 0)],
      implicitTail: [workRef(4), workRef(3)],
      generation: 2,
    });

    expect(compacted.throughVersion).toBe(2);
    expect(validateStackSnapshot(compacted)).toEqual([
      workRef(2),
      workRef(1),
      workRef(0),
      workRef(3),
      workRef(4),
    ]);

    const transaction = buildStackCompactionTransaction({
      scope,
      expectedStackVersion: 2,
      expectedSnapshotGeneration: 1,
      snapshot: compacted,
    });
    const items = transaction.TransactItems ?? [];
    expect(items.filter((item) => String(item.Put?.Item?.SK).startsWith('SNAPSHOT#'))).toHaveLength(
      compacted.chunks.length,
    );
    expect(
      items.some(
        (item) =>
          item.Update?.Key?.SK === 'META' &&
          item.Update?.ConditionExpression?.includes('currentSnapshotGeneration'),
      ),
    ).toBe(true);
  });

  it('rebuilds from canonical operations when a derived snapshot is corrupt', () => {
    const snapshot = prepareStackSnapshot({
      scope,
      generation: 1,
      throughVersion: 0,
      workRefs: [workRef(0), workRef(1), workRef(2)],
    });
    const corrupt = {
      ...snapshot,
      chunks: snapshot.chunks.map((chunk, index) =>
        index === 0 ? { ...chunk, checksum: '0'.repeat(64) } : chunk,
      ),
    };

    expect(() => validateStackSnapshot(corrupt)).toThrow(/checksum|corrupt/i);
    expect(
      recoverCanonicalStack({
        scope,
        baseMembership: [workRef(0), workRef(1), workRef(2)],
        snapshot: corrupt,
        operations: [simpleMove(1, 2, 0)],
      }),
    ).toMatchObject({
      rebuiltSnapshot: true,
      throughVersion: 1,
      workRefs: [workRef(2), workRef(0), workRef(1)],
    });
  });

  it('rejects missing chunks and canonical operation version gaps instead of advancing', () => {
    const snapshot = prepareStackSnapshot({
      scope,
      generation: 1,
      throughVersion: 0,
      workRefs: Array.from({ length: 200 }, (_, index) => workRef(index)),
      targetUncompressedChunkBytes: 1_000,
    });
    const missingChunk = { ...snapshot, chunks: snapshot.chunks.slice(1) };

    expect(() => validateStackSnapshot(missingChunk)).toThrow(/chunk|contiguous|missing/i);
    expect(() =>
      recoverCanonicalStack({
        scope,
        baseMembership: [workRef(0), workRef(1), workRef(2)],
        operations: [simpleMove(1, 2, 0), simpleMove(3, 1, 0)],
      }),
    ).toThrow(/version|gap|contiguous/i);
  });
});
