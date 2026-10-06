import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  lists: new Map<string, any>(),
  items: new Map<string, any>(),
  outbox: new Map<string, any>(),
  conflicts: new Map<string, any>(),
  tasks: new Map<string, any>(),
  settings: new Map<string, any>(),
  failOutbox: false,
}));
const database = vi.hoisted(() => {
  const table = (records: Map<string, any>) => ({
    add: vi.fn(async (value: any) => {
      records.set(value.id, value);
    }),
    put: vi.fn(async (value: any) => {
      records.set(value.id, value);
    }),
    get: vi.fn(async (id: string) => records.get(id)),
    delete: vi.fn(async (id: string) => records.delete(id)),
    toArray: vi.fn(async () => [...records.values()]),
    orderBy: vi.fn(() => ({ reverse: () => ({ toArray: async () => [...records.values()] }) })),
  });
  const secureLists = table(state.lists),
    secureListItems = table(state.items);
  const secureConflicts = table(state.conflicts),
    secureTasks = table(state.tasks);
  const settings = {
    ...table(state.settings),
    put: vi.fn(async (value: any) => state.settings.set(value.key, value)),
  };
  const outbox = {
    ...table(state.outbox),
    where: vi.fn(() => ({
      equals: (entityId: string) => ({
        count: async () =>
          [...state.outbox.values()].filter((value) => value.entityId === entityId).length,
      }),
    })),
    add: vi.fn(async (value: any) => {
      if (state.failOutbox) throw new Error('QuotaExceededError');
      state.outbox.set(value.id, value);
    }),
  };
  return {
    db: {
      secureLists,
      secureListItems,
      secureConflicts,
      secureTasks,
      settings,
      outbox,
      transaction: vi.fn(async (_mode: string, ...arguments_: any[]) => {
        const callback = arguments_.at(-1);
        const stores = [
          state.lists,
          state.items,
          state.outbox,
          state.conflicts,
          state.tasks,
          state.settings,
        ];
        const snapshots = stores.map((value) => new Map(value));
        try {
          return await callback();
        } catch (error) {
          stores.forEach((value, index) => {
            value.clear();
            for (const [key, row] of snapshots[index]!) value.set(key, row);
          });
          throw error;
        }
      }),
    },
  };
});
vi.mock('../../src/db/database.js', () => database);
vi.mock('../../src/db/task-repository.js', () => ({
  encryptLocalValue: async (_namespace: string, _id: string, value: unknown) => value,
  decryptLocalValue: async (_namespace: string, _id: string, value: unknown) => value,
}));

import {
  addLocalListItem,
  listLocalListItems,
  listLocalLists,
  saveNewList,
  updateLocalListItem,
} from '../../src/db/list-repository.js';
import {
  dismissObsoleteConflicts,
  readConflictDisplayContext,
  STALE_CONFLICT_AGE_MS,
} from '../../src/sync/conflict-review.js';

beforeEach(() => {
  state.lists.clear();
  state.items.clear();
  state.outbox.clear();
  state.conflicts.clear();
  state.tasks.clear();
  state.settings.clear();
  state.failOutbox = false;
  vi.clearAllMocks();
});

describe('encrypted local list repository', () => {
  it('commits encrypted entity and durable outbox records together across a restart read', async () => {
    const list = await saveNewList('Groceries', 'owner');
    const item = await addLocalListItem(list.id, { name: 'Milk', amountMinor: null }, 'owner');
    expect(await listLocalLists()).toEqual([list]);
    expect((await listLocalListItems(list.id))[0]).toMatchObject({
      directorySnapshot: { name: 'Milk' },
    });
    expect(state.outbox.size).toBe(2);

    const [completed, reopened] = await Promise.all([
      updateLocalListItem(item, { status: 'completed' }, 'owner'),
      updateLocalListItem(item, { status: 'open' }, 'owner'),
    ]);
    expect(completed.version).toBe(2);
    expect(reopened.version).toBe(3);
    expect([...state.outbox.values()].slice(-2).map((mutation) => mutation.baseVersion)).toEqual([
      1, 2,
    ]);
    const completedMutation = [...state.outbox.values()].at(-2);
    expect(await readConflictDisplayContext(completedMutation)).toEqual({
      entityLabel: 'Milk',
      parentLabel: 'Groceries',
    });
    state.conflicts.set(completedMutation.id, {
      id: completedMutation.id,
      updatedAt: new Date(0).toISOString(),
      value: { mutation: completedMutation, result: { reason: 'hard_deleted' } },
    });
    expect(
      await dismissObsoleteConflicts({ expiredOnly: true, now: STALE_CONFLICT_AGE_MS - 1 }),
    ).toBe(0);
    expect(await dismissObsoleteConflicts({ expiredOnly: true, now: STALE_CONFLICT_AGE_MS })).toBe(
      0,
    );
    for (const [id, mutation] of state.outbox)
      if (mutation.entityId === item.id) state.outbox.delete(id);
    expect(await dismissObsoleteConflicts({ expiredOnly: true, now: STALE_CONFLICT_AGE_MS })).toBe(
      1,
    );
    expect(state.conflicts.size).toBe(0);
    expect(state.items.has(item.id)).toBe(false);
  });

  it('rolls the entity back when quota prevents the outbox write', async () => {
    state.failOutbox = true;
    await expect(saveNewList('Cannot partially save', 'owner')).rejects.toThrow('QuotaExceeded');
    expect(state.lists.size).toBe(0);
    expect(state.outbox.size).toBe(0);
  });
});
