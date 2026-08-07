import { describe, expect, it } from 'vitest';
import type { PersonalStackScope, WorkReference } from '@naaseh/domain';
import {
  createStackCompactor,
  type StackCompactionMetadata,
  type StackCompactionRepository,
} from '../../src/ranking/stack-compactor.js';
import {
  buildStackCompactionTransaction,
  prepareStackSnapshot,
  validateStackSnapshot,
  type PreparedStackSnapshot,
} from '../../src/ranking/stack-repository.js';

const scope = { userId: 'owner', scopeType: 'overall' } as const;
const reference = (suffix: string, epoch = suffix): WorkReference => ({
  workType: 'task',
  workId: `01K00000000000000000000${suffix}`,
  membershipEpoch: epoch,
});
const [a, b, c, d] = ['100', '101', '102', '103'].map((suffix) => reference(suffix)) as [
  WorkReference,
  WorkReference,
  WorkReference,
  WorkReference,
];
const move = (
  version: number,
  movedWork: WorkReference,
  anchors: { beforeWork?: WorkReference; afterWork?: WorkReference },
) => ({
  version,
  kind: 'simple_move',
  movedWork,
  ...anchors,
});

class MemoryCompactionRepository implements StackCompactionRepository {
  metadata: StackCompactionMetadata | undefined = {
    version: 2,
    currentSnapshotGeneration: 1,
    snapshotThroughVersion: 0,
    operationDepth: 2,
  };
  membership = [a, b, c, d];
  snapshot: PreparedStackSnapshot | undefined = prepareStackSnapshot({
    scope,
    generation: 1,
    throughVersion: 0,
    workRefs: [a, b, c],
  });
  operations: Array<Record<string, unknown>> = [
    move(1, c, { afterWork: a }),
    move(2, b, { beforeWork: c }),
  ];
  commitAttempts = 0;
  conflictsRemaining = 0;

  async loadMetadata() {
    return this.metadata ? { ...this.metadata } : undefined;
  }

  async loadMembership() {
    return [...this.membership];
  }

  async loadSnapshot() {
    return this.snapshot;
  }

  async loadCanonicalOperations(...[, throughVersion]: [PersonalStackScope, number]) {
    return this.operations.filter((operation) => Number(operation.version) <= throughVersion);
  }

  async commitSnapshot(input: {
    scope: PersonalStackScope;
    metadata: StackCompactionMetadata;
    snapshot: PreparedStackSnapshot;
  }) {
    this.commitAttempts += 1;
    if (this.conflictsRemaining > 0) {
      this.conflictsRemaining -= 1;
      return false;
    }
    if (
      !this.metadata ||
      this.metadata.version !== input.metadata.version ||
      this.metadata.currentSnapshotGeneration !== input.metadata.currentSnapshotGeneration
    )
      return false;
    this.snapshot = input.snapshot;
    this.metadata = {
      version: input.metadata.version,
      currentSnapshotGeneration: input.snapshot.generation,
      snapshotThroughVersion: input.snapshot.throughVersion,
      operationDepth: 0,
    };
    return true;
  }
}

describe('personal stack compactor', () => {
  it('conditionally supports the first pointer when snapshot generation is absent', () => {
    const snapshot = prepareStackSnapshot({
      scope,
      generation: 1,
      throughVersion: 0,
      workRefs: [],
    });
    const transaction = buildStackCompactionTransaction({
      scope,
      expectedStackVersion: 0,
      expectedSnapshotGeneration: 0,
      snapshot,
    });
    expect(transaction.TransactItems.at(-1)?.Update?.ConditionExpression).toContain(
      'attribute_not_exists(currentSnapshotGeneration)',
    );
  });

  it('writes a verified next-generation snapshot and retains every canonical operation', async () => {
    const repository = new MemoryCompactionRepository();
    const originalOperations = [...repository.operations];
    const result = await createStackCompactor(repository)(scope);

    expect(result).toEqual({
      status: 'compacted',
      attempts: 1,
      throughVersion: 2,
      generation: 2,
    });
    expect(validateStackSnapshot(repository.snapshot!)).toEqual([c, b, a, d]);
    expect(repository.metadata).toMatchObject({
      version: 2,
      currentSnapshotGeneration: 2,
      snapshotThroughVersion: 2,
      operationDepth: 0,
    });
    expect(repository.operations).toEqual(originalOperations);
  });

  it('is idempotent after pointer advancement and does not create another generation', async () => {
    const repository = new MemoryCompactionRepository();
    const compact = createStackCompactor(repository);
    await compact(scope);
    const replay = await compact(scope);

    expect(replay).toEqual({
      status: 'already_compacted',
      attempts: 1,
      throughVersion: 2,
      generation: 2,
    });
    expect(repository.commitAttempts).toBe(1);
  });

  it('retries a conditional pointer conflict from fresh metadata', async () => {
    const repository = new MemoryCompactionRepository();
    repository.conflictsRemaining = 1;

    await expect(createStackCompactor(repository)(scope)).resolves.toMatchObject({
      status: 'compacted',
      attempts: 2,
      generation: 2,
    });
    expect(repository.commitAttempts).toBe(2);
  });

  it('rebuilds a corrupt derived snapshot from membership and the canonical log', async () => {
    const repository = new MemoryCompactionRepository();
    repository.snapshot = {
      ...repository.snapshot!,
      chunks: repository.snapshot!.chunks.map((chunk, index) =>
        index ? chunk : { ...chunk, checksum: '0'.repeat(64) },
      ),
    };

    await expect(createStackCompactor(repository)(scope)).resolves.toMatchObject({
      status: 'compacted',
      throughVersion: 2,
    });
    expect(validateStackSnapshot(repository.snapshot!)).toEqual([c, b, a, d]);
  });

  it('fails closed on a canonical version gap without advancing the pointer', async () => {
    const repository = new MemoryCompactionRepository();
    repository.operations = [move(1, c, { afterWork: a })];

    await expect(createStackCompactor(repository)(scope)).rejects.toThrow(/version gap/iu);
    expect(repository.commitAttempts).toBe(0);
    expect(repository.metadata?.currentSnapshotGeneration).toBe(1);
  });
});
