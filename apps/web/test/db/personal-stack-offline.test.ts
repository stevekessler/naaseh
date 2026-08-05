import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;

const state = vi.hoisted(() => ({
  scopes: new Map<string, Row>(),
  memberships: new Map<string, Row>(),
  operations: new Map<string, Row>(),
  operationChunks: new Map<string, Row>(),
  snapshots: new Map<string, Row>(),
  stackConflicts: new Map<string, Row>(),
  outbox: new Map<string, Row>(),
  settings: new Map<string, Row>(),
  cryptoKeys: new Map<string, Row>(),
  genericConflicts: new Map<string, Row>(),
  failOutbox: false,
}));

const database = vi.hoisted(() => {
  const table = (records: Map<string, Row>, key = 'id') => {
    const select = (field: string, expected: unknown) =>
      [...records.values()].filter((row) => row[field] === expected);
    const collection = (values: () => Row[]) => ({
      toArray: async () => values(),
      first: async () => values()[0],
      sortBy: async (field: string) =>
        values().sort((left, right) => String(left[field]).localeCompare(String(right[field]))),
      delete: async () => {
        const selected = new Set(values().map((row) => String(row[key])));
        for (const id of selected) records.delete(id);
      },
    });
    return {
      add: vi.fn(async (value: Row) => {
        if (records === state.outbox && state.failOutbox) throw new Error('QuotaExceededError');
        records.set(String(value[key]), value);
      }),
      put: vi.fn(async (value: Row) => records.set(String(value[key]), value)),
      bulkPut: vi.fn(async (values: Row[]) => {
        for (const value of values) records.set(String(value[key]), value);
      }),
      get: vi.fn(async (id: string) => records.get(id)),
      delete: vi.fn(async (id: string) => records.delete(id)),
      bulkDelete: vi.fn(async (ids: string[]) => ids.forEach((id) => records.delete(id))),
      clear: vi.fn(async () => records.clear()),
      count: vi.fn(async () => records.size),
      toArray: vi.fn(async () => [...records.values()]),
      update: vi.fn(async (id: string, patch: Row) => {
        const current = records.get(id);
        if (current) records.set(id, { ...current, ...patch });
      }),
      orderBy: vi.fn((field: string) => {
        const values = () =>
          [...records.values()].sort((left, right) =>
            String(left[field] ?? '').localeCompare(String(right[field] ?? '')),
          );
        return {
          ...collection(values),
          reverse: () => collection(() => values().reverse()),
        };
      }),
      where: vi.fn((field: string) => ({
        equals: (expected: unknown) => collection(() => select(field, expected)),
        anyOf: (expected: unknown[]) =>
          collection(() => [...records.values()].filter((row) => expected.includes(row[field]))),
      })),
    };
  };

  const maps = Object.values(state).filter(
    (value): value is Map<string, Row> => value instanceof Map,
  );
  return {
    db: {
      secureStackScopes: table(state.scopes),
      secureStackMemberships: table(state.memberships),
      secureStackOperations: table(state.operations),
      secureStackOperationChunks: table(state.operationChunks),
      secureStackSnapshots: table(state.snapshots),
      secureStackConflicts: table(state.stackConflicts),
      secureConflicts: table(state.genericConflicts),
      outbox: table(state.outbox),
      settings: table(state.settings, 'key'),
      cryptoKeys: table(state.cryptoKeys),
      transaction: vi.fn(async (_mode: string, ...arguments_: any[]) => {
        const callback = arguments_.at(-1) as () => Promise<unknown>;
        const snapshots = maps.map((records) => new Map(records));
        try {
          return await callback();
        } catch (error) {
          maps.forEach((records, index) => {
            records.clear();
            for (const [id, row] of snapshots[index]!) records.set(id, row);
          });
          throw error;
        }
      }),
    },
  };
});

vi.mock('../../src/db/database.js', () => database);
vi.mock('../../src/db/task-repository.js', () => ({
  encryptLocalValue: async (_namespace: string, _id: string, value: unknown) => ({
    iv: 'test-iv',
    ciphertext: Buffer.from(JSON.stringify(value)).toString('base64'),
  }),
  decryptLocalValue: async (_namespace: string, _id: string, value: { ciphertext: string }) =>
    JSON.parse(Buffer.from(value.ciphertext, 'base64').toString()),
  decryptMutation: async (record: Row) => ({
    ...record,
    payload: JSON.parse(Buffer.from(record.payload.ciphertext, 'base64').toString()),
  }),
  markRevisionSynced: vi.fn(),
}));

import {
  acknowledgeLocalStackOperation,
  applyOwnerStackChange,
  initializeLocalStack,
  listLocalStackConflicts,
  listPendingStackOperations,
  readLocalStack,
  removeLocalStackMembership,
  reorderLocalStack,
  purgeLocalPersonalStack,
} from '../../src/db/personal-stack-repository.js';
import { drainOutbox, pullChanges, queuePersonalStackReorder } from '../../src/sync/sync-engine.js';
import {
  listPersonalStackConflicts,
  resolvePersonalStackConflict,
} from '../../src/sync/conflict-resolution.js';

const taskA = {
  workType: 'task' as const,
  workId: '01J00000000000000000000001',
  membershipEpoch: 'epoch-a',
};
const taskB = {
  workType: 'task' as const,
  workId: '01J00000000000000000000002',
  membershipEpoch: 'epoch-b',
};
const listC = {
  workType: 'list' as const,
  workId: '01J00000000000000000000003',
  membershipEpoch: 'epoch-c',
};
const overall = { scopeType: 'overall' as const };
const ownerId = 'owner';

const seed = () =>
  initializeLocalStack({ ownerId, scope: overall, version: 0, work: [taskA, taskB, listC] });

beforeEach(() => {
  for (const value of Object.values(state)) if (value instanceof Map) value.clear();
  state.failOutbox = false;
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('fetch', vi.fn());
});

describe('encrypted offline personal-stack persistence', () => {
  it('commits a reorder and encrypted outbox mutation atomically', async () => {
    await seed();
    const accepted = await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: listC, afterWork: taskA },
    });

    expect(accepted.status).toBe('pending');
    expect((await readLocalStack(ownerId, overall)).work).toEqual([listC, taskA, taskB]);
    expect(state.operations.size).toBe(1);
    expect(state.outbox.size).toBe(1);
    expect([...state.operations.values()][0]?.value).toMatchObject({
      ciphertext: expect.any(String),
    });
    expect([...state.outbox.values()][0]).toMatchObject({
      entityType: 'personalStackOperation',
      operation: 'reorder',
      payload: { ciphertext: expect.any(String) },
    });

    const before = await readLocalStack(ownerId, overall);
    state.failOutbox = true;
    await expect(
      reorderLocalStack({
        ownerId,
        scope: overall,
        baseVersion: before.version,
        sourceClientId: 'browser-a',
        move: { kind: 'simple_move', movedWork: taskB, afterWork: listC },
      }),
    ).rejects.toThrow('QuotaExceeded');
    expect(await readLocalStack(ownerId, overall)).toEqual(before);
  });

  it('recovers the same order and pending acknowledgement after a repository restart', async () => {
    await seed();
    const pending = await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: taskB, afterWork: taskA },
    });

    expect((await readLocalStack(ownerId, overall)).work).toEqual([taskB, taskA, listC]);
    expect(await listPendingStackOperations(ownerId)).toEqual([
      expect.objectContaining({ mutationId: pending.mutationId, status: 'pending' }),
    ]);

    await acknowledgeLocalStackOperation({
      mutationId: pending.mutationId,
      operationId: pending.operationId,
      status: 'applied',
      version: 1,
    });
    expect(await listPendingStackOperations(ownerId)).toEqual([]);
  });

  it('applies owner-only feed operations without exposing them to a shared scope', async () => {
    await seed();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          changes: [
            {
              entityType: 'personalStackOperation',
              entityId: '01J00000000000000000000010',
              operation: 'upsert',
              payload: {
                id: '01J00000000000000000000010',
                mutationId: '01J00000000000000000000011',
                userId: ownerId,
                scopeType: 'overall',
                baseVersion: 0,
                version: 1,
                kind: 'simple_move',
                movedWork: listC,
                afterWork: taskA,
                affectedCount: 1,
                affectedHash: '0'.repeat(64),
                outcome: 'applied',
                sourceClientId: 'browser-b',
                acceptedAt: '2026-08-05T12:00:00.000Z',
              },
            },
          ],
          cursor: { owner: 1 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await pullChanges();

    expect((await readLocalStack(ownerId, overall)).work).toEqual([listC, taskA, taskB]);
    expect([...state.operations.values()][0]).toMatchObject({
      ownerId,
      scopeKey: `${ownerId}:overall`,
    });
  });

  it('serializes same-user scope writes and derives each queued base version locally', async () => {
    await seed();
    const first = queuePersonalStackReorder({
      ownerId,
      scope: overall,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: taskB, afterWork: taskA },
    });
    const second = queuePersonalStackReorder({
      ownerId,
      scope: overall,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: listC, beforeWork: taskB },
    });

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ version: 1 }),
      expect.objectContaining({ version: 2 }),
    ]);
    expect((await readLocalStack(ownerId, overall)).work).toEqual([taskB, listC, taskA]);
    expect(
      (await listPendingStackOperations(ownerId)).map(({ baseVersion }) => baseVersion),
    ).toEqual([0, 1]);
  });

  it('replays an offline reorder once after reconnect and clears its pending state', async () => {
    await seed();
    const pending = await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: taskB, beforeWork: listC },
    });
    vi.mocked(fetch).mockImplementation(async (_input, init) => {
      const request = JSON.parse(String(init?.body)) as {
        contractVersion: number;
        mutations: Array<{ id: string; ownerId?: string }>;
        backlog?: unknown;
      };
      expect(request.contractVersion).toBe(4);
      expect(request.mutations[0]).not.toHaveProperty('ownerId');
      expect(request).not.toHaveProperty('backlog');
      return new Response(
        JSON.stringify({
          results: request.mutations.map((mutation) => ({
            mutationId: mutation.id,
            operationId: pending.operationId,
            status: 'alreadyApplied',
            version: 1,
          })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    await drainOutbox('csrf');

    expect(state.outbox.size).toBe(0);
    expect(await listPendingStackOperations(ownerId)).toEqual([]);
    expect((await readLocalStack(ownerId, overall)).work).toEqual([taskA, listC, taskB]);
  });

  it('converges same-user offline and second-device operations in server version order', async () => {
    await seed();
    const offline = await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a-offline',
      move: { kind: 'simple_move', movedWork: taskB, afterWork: taskA },
    });
    expect((await readLocalStack(ownerId, overall)).work).toEqual([taskB, taskA, listC]);

    await applyOwnerStackChange({
      id: '01J00000000000000000000020',
      mutationId: '01J00000000000000000000021',
      userId: ownerId,
      scopeType: 'overall',
      baseVersion: 1,
      version: 2,
      kind: 'simple_move',
      movedWork: listC,
      afterWork: taskA,
      sourceClientId: 'browser-b-online',
      acceptedAt: '2026-08-05T12:00:00.000Z',
    });
    expect((await readLocalStack(ownerId, overall)).work).toEqual([taskB, listC, taskA]);

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              mutationId: offline.mutationId,
              operationId: offline.operationId,
              status: 'alreadyApplied',
              version: 1,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await drainOutbox('csrf');

    expect(await listPendingStackOperations(ownerId)).toEqual([]);
    expect((await readLocalStack(ownerId, overall)).work).toEqual([taskB, listC, taskA]);
  });

  it('surfaces an encrypted conflict and can repair it by reapplying intent', async () => {
    await seed();
    const pending = await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: listC, afterWork: taskA },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              mutationId: pending.mutationId,
              status: 'conflict',
              reason: 'anchor_removed',
              currentVersion: 2,
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    await drainOutbox('csrf');
    const [conflict] = await listLocalStackConflicts(ownerId);
    expect(conflict).toMatchObject({ reason: 'anchor_removed', currentVersion: 2 });
    expect([...state.stackConflicts.values()][0]?.value).toMatchObject({
      ciphertext: expect.any(String),
    });

    await resolvePersonalStackConflict(conflict!, 'reapply');
    expect(await listLocalStackConflicts(ownerId)).toEqual([]);
    expect(await listPendingStackOperations(ownerId)).toEqual([
      expect.objectContaining({ status: 'pending', baseVersion: 2 }),
    ]);
  });

  it('surfaces authorization conflicts as discard-only and removes them on discard', async () => {
    await seed();
    const pending = await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: taskB, afterWork: taskA },
    });
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          results: [
            {
              mutationId: pending.mutationId,
              status: 'conflict',
              problem: { reason: 'authorization_changed', currentVersion: 1 },
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await drainOutbox('csrf');
    const [conflict] = await listPersonalStackConflicts(ownerId);
    expect(conflict).toMatchObject({ reason: 'authorization_changed', canReapply: false });
    await expect(resolvePersonalStackConflict(conflict!, 'reapply')).rejects.toThrow(
      'can only be discarded',
    );
    await resolvePersonalStackConflict(conflict!, 'discard');
    expect(await listPersonalStackConflicts(ownerId)).toEqual([]);
  });

  it.each(['lifecycle_changed', 'hard_deleted'] as const)(
    'removes unavailable work and makes a %s reconnect conflict discard-only',
    async (reason) => {
      await seed();
      const pending = await reorderLocalStack({
        ownerId,
        scope: overall,
        baseVersion: 0,
        sourceClientId: 'browser-a-offline',
        move: { kind: 'simple_move', movedWork: taskB, afterWork: taskA },
      });

      await removeLocalStackMembership(ownerId, taskB.workType, taskB.workId);
      expect((await readLocalStack(ownerId, overall)).work).toEqual([taskA, listC]);
      vi.mocked(fetch).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [
              {
                mutationId: pending.mutationId,
                status: 'conflict',
                reason,
                currentVersion: 1,
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );

      await drainOutbox('csrf');
      const [conflict] = await listPersonalStackConflicts(ownerId);
      expect(conflict).toMatchObject({ reason, canReapply: false });
      await expect(resolvePersonalStackConflict(conflict!, 'reapply')).rejects.toThrow(
        'can only be discarded',
      );
      await resolvePersonalStackConflict(conflict!, 'discard');
      expect(await listPersonalStackConflicts(ownerId)).toEqual([]);
      expect((await readLocalStack(ownerId, overall)).work).toEqual([taskA, listC]);
    },
  );

  it('purges only the signed-out user private stack cache and pending mutations', async () => {
    await seed();
    await initializeLocalStack({
      ownerId: 'other-user',
      scope: overall,
      version: 0,
      work: [taskA],
    });
    await reorderLocalStack({
      ownerId,
      scope: overall,
      baseVersion: 0,
      sourceClientId: 'browser-a',
      move: { kind: 'simple_move', movedWork: taskB, afterWork: taskA },
    });

    await purgeLocalPersonalStack(ownerId);

    await expect(readLocalStack(ownerId, overall)).resolves.toBeUndefined();
    await expect(readLocalStack('other-user', overall)).resolves.toBeDefined();
    expect([...state.outbox.values()].some((row) => row.ownerId === ownerId)).toBe(false);
  });
});
