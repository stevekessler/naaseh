import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, any>;
type Urgency = 'extra_low' | 'low' | 'medium' | 'high' | 'critical';

const state = vi.hoisted(() => ({
  tasks: new Map<string, Row>(),
  secureTasks: new Map<string, Row>(),
  revisions: new Map<string, Row>(),
  secureRevisions: new Map<string, Row>(),
  completionEvents: new Map<string, Row>(),
  projects: new Map<string, Row>(),
  categories: new Map<string, Row>(),
  lists: new Map<string, Row>(),
  outbox: new Map<string, Row>(),
  conflicts: new Map<string, Row>(),
  settings: new Map<string, Row>(),
  cryptoKeys: new Map<string, Row>(),
}));

const database = vi.hoisted(() => {
  const table = (records: Map<string, Row>, key = 'id') => {
    const ordered = (field: string) => {
      const values = () =>
        [...records.values()].sort((left, right) =>
          String(left[field] ?? '').localeCompare(String(right[field] ?? '')),
        );
      return {
        toArray: async () => values(),
        first: async () => values()[0],
        reverse: () => ({
          toArray: async () => values().reverse(),
          first: async () => values().reverse()[0],
        }),
      };
    };
    return {
      add: vi.fn(async (value: Row) => records.set(String(value[key]), value)),
      put: vi.fn(async (value: Row) => records.set(String(value[key]), value)),
      bulkPut: vi.fn(async (values: Row[]) => {
        for (const value of values) records.set(String(value[key]), value);
      }),
      get: vi.fn(async (id: string) => records.get(id)),
      delete: vi.fn(async (id: string) => records.delete(id)),
      clear: vi.fn(async () => records.clear()),
      count: vi.fn(async () => records.size),
      toArray: vi.fn(async () => [...records.values()]),
      orderBy: vi.fn(ordered),
      where: vi.fn((field: string) => ({
        equals: (expected: unknown) => ({
          first: async () => [...records.values()].find((row) => row[field] === expected),
          toArray: async () => [...records.values()].filter((row) => row[field] === expected),
          sortBy: async (sortField: string) =>
            [...records.values()]
              .filter((row) => row[field] === expected)
              .sort((left, right) =>
                String(left[sortField]).localeCompare(String(right[sortField])),
              ),
          delete: async () => {
            for (const [id, row] of records) if (row[field] === expected) records.delete(id);
          },
        }),
      })),
      update: vi.fn(async (id: string, patch: Row) => {
        const current = records.get(id);
        if (current) records.set(id, { ...current, ...patch });
      }),
    };
  };

  const tables = {
    tasks: table(state.tasks),
    secureTasks: table(state.secureTasks),
    revisions: table(state.revisions),
    secureRevisions: table(state.secureRevisions),
    secureCompletionEvents: table(state.completionEvents),
    secureProjects: table(state.projects),
    secureCategories: table(state.categories),
    secureLists: table(state.lists),
    outbox: table(state.outbox),
    secureConflicts: table(state.conflicts),
    settings: table(state.settings, 'key'),
    cryptoKeys: table(state.cryptoKeys),
  };

  return {
    db: {
      ...tables,
      transaction: vi.fn(async (_mode: string, ...arguments_: any[]) => {
        const callback = arguments_.at(-1) as () => Promise<unknown>;
        const maps = Object.values(state) as Map<string, Row>[];
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
vi.mock('../../src/crypto/vault.js', () => ({
  createDeviceKey: async () => ({ algorithm: 'test-key' }),
  encryptText: async (plaintext: string) => ({
    iv: 'test-iv',
    ciphertext: Buffer.from(plaintext).toString('base64'),
  }),
  decryptText: async (value: { ciphertext: string }) =>
    Buffer.from(value.ciphertext, 'base64').toString(),
}));

import {
  listLocalTasks,
  listLocalTasksByUrgency,
  saveNewTask,
  updateTask,
} from '../../src/db/task-repository.js';
import {
  listLocalLists,
  listLocalListsByUrgency,
  saveNewList,
  updateLocalList,
} from '../../src/db/list-repository.js';
import { drainOutbox, listConflicts } from '../../src/sync/sync-engine.js';

const urgencyOf = (value: unknown) => (value as { urgency?: Urgency }).urgency;

beforeEach(() => {
  for (const records of Object.values(state)) records.clear();
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { mutations: Array<{ id: string }> };
      return new Response(
        JSON.stringify({
          results: body.mutations.map((mutation) => ({
            mutationId: mutation.id,
            status: 'applied',
          })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
});

describe('offline Task/List urgency persistence', () => {
  it('defaults new encrypted local Tasks and Lists to Medium', async () => {
    const task = await saveNewTask({ label: 'Default task' }, 'owner');
    const list = await saveNewList('Default list', 'owner');

    expect(urgencyOf(task)).toBe('medium');
    expect(urgencyOf(list)).toBe('medium');
    expect(state.secureTasks.get(task.id)).toMatchObject({ urgency: 'medium' });
    expect(state.lists.get(list.id)).toMatchObject({ urgency: 'medium' });
    expect(state.secureTasks.get(task.id)?.value).toMatchObject({ ciphertext: expect.any(String) });
    expect(state.lists.get(list.id)?.value).toMatchObject({ ciphertext: expect.any(String) });
  });

  it('atomically queues encrypted urgency edits and reads them after restart', async () => {
    const task = await saveNewTask({ label: 'Offline task' }, 'owner');
    const list = await saveNewList('Offline list', 'owner');
    state.outbox.clear();

    await updateTask(task, { urgency: 'high' } as Partial<typeof task>, 'owner');
    await updateLocalList(list, { urgency: 'critical' } as Partial<typeof list>);

    expect((await listLocalTasks()).map(urgencyOf)).toEqual(['high']);
    expect((await listLocalLists()).map(urgencyOf)).toEqual(['critical']);
    expect([...state.outbox.values()]).toHaveLength(2);
    for (const mutation of state.outbox.values())
      expect(mutation.payload).toMatchObject({ ciphertext: expect.any(String) });
  });

  it('filters encrypted offline Task and List caches without changing their saved values', async () => {
    await saveNewTask({ label: 'Low offline task', urgency: 'low' }, 'owner');
    await saveNewTask({ label: 'Critical offline task', urgency: 'critical' }, 'owner');
    await saveNewList('High offline list', 'owner', undefined, 'high');
    await saveNewList('Critical offline list', 'owner', undefined, 'critical');

    expect((await listLocalTasksByUrgency(['critical'])).map(urgencyOf)).toEqual(['critical']);
    expect((await listLocalListsByUrgency(['high'])).map(urgencyOf)).toEqual(['high']);
    expect((await listLocalTasksByUrgency([])).map(urgencyOf)).toEqual(
      expect.arrayContaining(['low', 'critical']),
    );
    expect((await listLocalListsByUrgency([])).map(urgencyOf)).toEqual(
      expect.arrayContaining(['high', 'critical']),
    );
  });

  it('replays pending urgency mutations once after reconnect without losing local values', async () => {
    const task = await saveNewTask({ label: 'Reconnect task' }, 'owner');
    const list = await saveNewList('Reconnect list', 'owner');
    await updateTask(task, { urgency: 'low' } as Partial<typeof task>, 'owner');
    await updateLocalList(list, { urgency: 'extra_low' } as Partial<typeof list>);

    await drainOutbox('csrf');

    expect(state.outbox.size).toBe(0);
    expect((await listLocalTasks()).map(urgencyOf)).toEqual(['low']);
    expect((await listLocalLists()).map(urgencyOf)).toEqual(['extra_low']);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('recovers a reconnect conflict without discarding the encrypted local urgency edit', async () => {
    const task = await saveNewTask({ label: 'Conflict task' }, 'owner');
    await drainOutbox('csrf');
    const edited = await updateTask(task, { urgency: 'critical' } as Partial<typeof task>, 'owner');
    vi.mocked(fetch).mockImplementationOnce(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { mutations: Array<{ id: string }> };
      return new Response(
        JSON.stringify({
          results: body.mutations.map((mutation) => ({
            mutationId: mutation.id,
            status: 'conflict',
            version: edited.version + 1,
          })),
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });

    await drainOutbox('csrf');

    expect(state.outbox.size).toBe(0);
    expect(state.conflicts.size).toBe(1);
    expect(urgencyOf((await listLocalTasks())[0])).toBe('critical');
    expect(await listConflicts()).toHaveLength(1);
  });
});
