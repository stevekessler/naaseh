import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  lists: new Map<string, any>(),
  items: new Map<string, any>(),
  outbox: new Map<string, any>(),
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
    toArray: vi.fn(async () => [...records.values()]),
    orderBy: vi.fn(() => ({ reverse: () => ({ toArray: async () => [...records.values()] }) })),
  });
  const secureLists = table(state.lists),
    secureListItems = table(state.items);
  const outbox = {
    ...table(state.outbox),
    add: vi.fn(async (value: any) => {
      if (state.failOutbox) throw new Error('QuotaExceededError');
      state.outbox.set(value.id, value);
    }),
  };
  return {
    db: {
      secureLists,
      secureListItems,
      outbox,
      transaction: vi.fn(async (_mode: string, ...arguments_: any[]) => {
        const callback = arguments_.at(-1);
        const snapshots = [state.lists, state.items, state.outbox].map((value) => new Map(value));
        try {
          return await callback();
        } catch (error) {
          [state.lists, state.items, state.outbox].forEach((value, index) => {
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
} from '../../src/db/list-repository.js';

beforeEach(() => {
  state.lists.clear();
  state.items.clear();
  state.outbox.clear();
  state.failOutbox = false;
  vi.clearAllMocks();
});

describe('encrypted local list repository', () => {
  it('commits encrypted entity and durable outbox records together across a restart read', async () => {
    const list = await saveNewList('Groceries', 'owner');
    await addLocalListItem(list.id, 'Milk', 'owner');
    expect(await listLocalLists()).toEqual([list]);
    expect((await listLocalListItems(list.id))[0]).toMatchObject({
      directorySnapshot: { name: 'Milk' },
    });
    expect(state.outbox.size).toBe(2);
  });

  it('rolls the entity back when quota prevents the outbox write', async () => {
    state.failOutbox = true;
    await expect(saveNewList('Cannot partially save', 'owner')).rejects.toThrow('QuotaExceeded');
    expect(state.lists.size).toBe(0);
    expect(state.outbox.size).toBe(0);
  });
});
