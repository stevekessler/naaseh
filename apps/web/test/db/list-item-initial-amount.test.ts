import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  items: new Map<string, any>(),
  outbox: new Map<string, any>(),
  failOnce: false,
}));

vi.mock('../../src/db/database.js', () => {
  const table = (records: Map<string, any>) => ({
    add: vi.fn(async (value: any) => {
      if (records === state.outbox && state.failOnce) {
        state.failOnce = false;
        throw new Error('offline outbox failure');
      }
      records.set(value.id, value);
    }),
    put: vi.fn(async (value: any) => records.set(value.id, value)),
    toArray: vi.fn(async () => [...records.values()]),
  });
  return {
    db: {
      secureListItems: table(state.items),
      secureLists: table(new Map()),
      outbox: table(state.outbox),
      transaction: vi.fn(async (_mode: string, ...args: any[]) => {
        const callback = args.at(-1);
        const itemSnapshot = new Map(state.items);
        const outboxSnapshot = new Map(state.outbox);
        try {
          return await callback();
        } catch (error) {
          state.items.clear();
          state.outbox.clear();
          for (const [key, value] of itemSnapshot) state.items.set(key, value);
          for (const [key, value] of outboxSnapshot) state.outbox.set(key, value);
          throw error;
        }
      }),
    },
  };
});
vi.mock('../../src/db/task-repository.js', () => ({
  encryptLocalValue: async (_namespace: string, _id: string, value: unknown) => value,
  decryptLocalValue: async (_namespace: string, _id: string, value: unknown) => value,
}));

import { addLocalListItem, listLocalListItems } from '../../src/db/list-repository.js';

beforeEach(() => {
  state.items.clear();
  state.outbox.clear();
  state.failOnce = false;
});

describe('initial list-item amount', () => {
  it('persists name and signed amount in the same item and outbox mutation', async () => {
    const item = await addLocalListItem(
      '01J00000000000000000000001',
      { name: 'Refund', amountMinor: 525 },
      'owner',
    );
    expect(item.directorySnapshot).toMatchObject({ name: 'Refund', amountMinor: 525 });
    expect([...state.outbox.values()][0].payload).toMatchObject({
      directorySnapshot: { name: 'Refund', amountMinor: 525 },
    });
  });

  it('rolls back a failed atomic attempt so retry creates exactly one durable item', async () => {
    state.failOnce = true;
    await expect(
      addLocalListItem('01J00000000000000000000001', { name: 'Milk', amountMinor: -399 }, 'owner'),
    ).rejects.toThrow('offline outbox failure');
    expect(await listLocalListItems('01J00000000000000000000001')).toEqual([]);

    await addLocalListItem(
      '01J00000000000000000000001',
      { name: 'Milk', amountMinor: -399 },
      'owner',
    );
    expect(await listLocalListItems('01J00000000000000000000001')).toHaveLength(1);
    expect(state.outbox.size).toBe(1);
  });
});
