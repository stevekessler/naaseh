import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
const state = vi.hoisted(() => ({
  timers: new Map<string, Row>(),
  checkpoints: new Map<string, Row>(),
  outbox: new Map<string, Row>(),
  conflicts: new Map<string, Row>(),
  failOutbox: false,
}));
const database = vi.hoisted(() => {
  const table = (records: Map<string, Row>) => ({
    get: async (id: string) => records.get(id),
    put: async (row: Row) => records.set(row.id, row),
    add: async (row: Row) => {
      if (records === state.outbox && state.failOutbox) throw new Error('QuotaExceededError');
      if (records.has(row.id)) throw new DOMException('duplicate', 'ConstraintError');
      records.set(row.id, row);
    },
    delete: async (id: string) => records.delete(id),
    bulkDelete: async (ids: string[]) => ids.forEach((id) => records.delete(id)),
    where: (field: string) => ({
      equals: (value: unknown) => ({
        toArray: async () => [...records.values()].filter((row) => row[field] === value),
      }),
    }),
  });
  const maps = [state.timers, state.checkpoints, state.outbox, state.conflicts];
  return {
    db: {
      secureTaskTimers: table(state.timers),
      secureTimerCheckpoints: table(state.checkpoints),
      secureConflicts: table(state.conflicts),
      outbox: table(state.outbox),
      transaction: async (_mode: string, ...args: any[]) => {
        const work = args.at(-1) as () => Promise<unknown>;
        const before = maps.map((map) => new Map(map));
        try {
          return await work();
        } catch (error) {
          maps.forEach((map, index) => {
            map.clear();
            for (const [key, value] of before[index]!) map.set(key, value);
          });
          throw error;
        }
      },
    },
  };
});
vi.mock('../../src/db/database.js', () => database);
vi.mock('../../src/db/task-repository.js', () => ({
  encryptLocalValue: async (_namespace: string, _id: string, value: unknown) => ({
    iv: 'iv',
    ciphertext: JSON.stringify(value),
  }),
  decryptLocalValue: async (_namespace: string, _id: string, value: Row) =>
    JSON.parse(value.ciphertext),
}));
vi.mock('../../src/db/client-id.js', () => ({ getClientId: async () => 'browser-a' }));

import {
  claimTimerFeedback,
  mutateLocalTaskTimer,
  projectLocalTaskTimer,
  purgeLocalTaskTimer,
} from '../../src/db/task-timer-repository.js';

const ownerId = '01J00000000000000000000001';
const taskId = '01J00000000000000000000002';

beforeEach(() => {
  Object.values(state).forEach((value) => value instanceof Map && value.clear());
  state.failOutbox = false;
});

describe('offline task timer', () => {
  it('atomically writes the encrypted timer and command outbox', async () => {
    const started = await mutateLocalTaskTimer({
      ownerId,
      command: { type: 'start', taskId },
      now: '2026-08-14T12:00:00.000Z',
    });
    expect(started.durationSeconds).toBe(600);
    expect(state.timers.get(ownerId)?.value.ciphertext).not.toContain('undefined');
    expect([...state.outbox.values()][0]).toMatchObject({
      entityType: 'taskTimer',
      operation: 'timerCommand',
      baseVersion: 0,
    });

    state.failOutbox = true;
    await expect(
      mutateLocalTaskTimer({
        ownerId,
        command: { type: 'pause' },
        now: '2026-08-14T12:01:00.000Z',
      }),
    ).rejects.toThrow('QuotaExceeded');
    expect((await projectLocalTaskTimer(ownerId))?.version).toBe(1);
  });

  it('claims feedback once per device/run interval and purges task access atomically', async () => {
    await mutateLocalTaskTimer({
      ownerId,
      command: { type: 'start', taskId },
      now: '2026-08-14T12:00:00.000Z',
    });
    const identity = { runId: 'run-a', intervalOrdinal: 1 };
    await expect(claimTimerFeedback(ownerId, taskId, identity)).resolves.toBe(true);
    await expect(claimTimerFeedback(ownerId, taskId, identity)).resolves.toBe(false);
    await purgeLocalTaskTimer(ownerId, taskId);
    expect(state.timers.size).toBe(0);
    expect(state.checkpoints.size).toBe(0);
    expect(state.outbox.size).toBe(0);
  });
});
