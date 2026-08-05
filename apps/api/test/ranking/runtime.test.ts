import { describe, expect, it, vi } from 'vitest';
import { createDurableStackRepository, type DurableStackStore } from '../../src/ranking/runtime.js';

const scope = { userId: 'owner', scopeType: 'overall' as const };
const first = {
  workType: 'task' as const,
  workId: '01K00000000000000000000001',
  membershipEpoch: '000000000001:2026-08-05T12:00:00.000Z',
};
const second = {
  workType: 'task' as const,
  workId: '01K00000000000000000000002',
  membershipEpoch: '000000000001:2026-08-05T12:00:00.000Z',
};

function store(overrides: Partial<DurableStackStore> = {}): DurableStackStore {
  return {
    loadMetadata: vi.fn(async () => undefined),
    loadSnapshot: vi.fn(async () => undefined),
    loadOperations: vi.fn(async () => []),
    loadReceipt: vi.fn(async () => undefined),
    loadOwnerFeedSequence: vi.fn(async () => 7),
    transact: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('durable personal stack runtime', () => {
  it('reconstructs canonical order from durable metadata and operations after a cold start', async () => {
    const repository = createDurableStackRepository(
      store({
        loadMetadata: vi.fn(async () => ({
          version: 1,
          currentSnapshotGeneration: 0,
          snapshotThroughVersion: 0,
          operationDepth: 1,
        })),
        loadOperations: vi.fn(async () => [
          { version: 1, kind: 'simple_move', movedWork: second, afterWork: first },
        ]),
      }),
    );

    await expect(repository.loadScope(scope, [first, second])).resolves.toEqual({
      version: 1,
      order: [second, first],
    });
  });

  it('writes metadata, canonical chunks, immutable receipt, audit, and owner feed atomically', async () => {
    const persistence = store();
    const repository = createDurableStackRepository(persistence);
    await expect(
      repository.commit({
        scope,
        expectedVersion: 0,
        next: { version: 1, order: [second, first] },
        mutationId: '01K00000000000000000000901',
        result: { status: 'applied', stackVersion: 1 },
        move: { kind: 'simple_move', movedWork: second, afterWork: first },
        sourceClientId: 'client-a',
        acceptedAt: '2026-08-05T12:00:00.000Z',
      }),
    ).resolves.toBe(true);

    const items = vi.mocked(persistence.transact).mock.calls[0]![0];
    expect(
      items.every((item) => {
        const operation = item.Put ?? item.Update ?? item.Delete ?? item.ConditionCheck;
        return operation?.TableName === 'naaseh-local';
      }),
    ).toBe(true);
    expect(items.some((item) => item.Update?.Key?.SK === 'META')).toBe(true);
    expect(items.some((item) => String(item.Put?.Item?.SK).startsWith('OP#'))).toBe(true);
    expect(items.some((item) => item.Put?.Item?.SK === 'MUTATION#01K00000000000000000000901')).toBe(
      true,
    );
    expect(items.some((item) => String(item.Put?.Item?.SK).startsWith('AUDIT#'))).toBe(true);
    expect(items.some((item) => item.Update?.Key?.PK === 'FEED#OWNER#owner')).toBe(true);
  });

  it('loads durable operation status and persists conflicts without advancing stack metadata', async () => {
    const persistence = store({
      loadReceipt: vi.fn(async () => ({
        status: 'conflict',
        stackVersion: 3,
        reason: 'version_mismatch',
      })),
    });
    const repository = createDurableStackRepository(persistence);
    await expect(repository.findMutation('owner', 'mutation-a')).resolves.toEqual({
      status: 'conflict',
      stackVersion: 3,
      reason: 'version_mismatch',
    });
    await expect(
      repository.commit({
        scope,
        expectedVersion: 3,
        next: { version: 3, order: [] },
        mutationId: 'mutation-b',
        result: { status: 'conflict', stackVersion: 3, reason: 'version_mismatch' },
      }),
    ).resolves.toBe(true);
    const items = vi.mocked(persistence.transact).mock.calls[0]![0];
    expect(items).toHaveLength(2);
    expect(items[0]?.ConditionCheck).toBeDefined();
    expect(items[1]?.Put?.Item?.data).toMatchObject({ status: 'conflict', stackVersion: 3 });
  });
});
