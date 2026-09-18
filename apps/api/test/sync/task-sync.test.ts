import { beforeEach, expect, it, vi } from 'vitest';
import {
  archiveTask,
  createTask,
  createUlid,
  type Task,
  type CompletionEvent,
  type Mutation,
} from '@naaseh/domain';
const state = vi.hoisted(() => ({
  task: undefined as Task | undefined,
  events: new Map<string, CompletionEvent>(),
}));
vi.mock('../../src/tasks/task-repository.js', () => ({
  findTask: async () => state.task,
  findCompletionEvent: async (id: string) => state.events.get(id),
  saveTaskMutation: vi.fn(async (task: Task) => {
    state.task = task;
    return { task, replayed: false };
  }),
  saveTaskLifecycleMutation: vi.fn(
    async (
      task: Task,
      _previous: Task,
      _actor: string,
      _mutation: string,
      _operation: string,
      event?: CompletionEvent,
    ) => {
      state.task = task;
      if (event) state.events.set(event.id, event);
    },
  ),
}));
vi.mock('../../src/projects/project-repository.js', () => ({ getProject: vi.fn() }));
vi.mock('../../src/categories/category-repository.js', () => ({ getCategory: vi.fn() }));
vi.mock('../../src/ranking/stack-membership-lifecycle.js', () => ({
  notifyStackMembershipWorkChange: vi.fn(),
}));
import { saveSyncedTask, taskSyncPatch } from '../../src/sync/task-sync.js';
const mutation = (payload: unknown, operation: Mutation['operation'] = 'update'): Mutation => ({
  id: createUlid(),
  entityId: state.task!.id,
  entityType: 'task',
  baseVersion: state.task!.version,
  payload,
  operation,
  createdAt: new Date().toISOString(),
  attempts: 0,
});
beforeEach(() => {
  state.task = createTask({ label: 'Original' }, 'owner');
  state.events.clear();
});

it('retries the actual nested browser edit without storing its envelope or protected fields', async () => {
  const saved = await saveSyncedTask(
    state.task,
    mutation({ patch: { label: 'Edited', dueKind: null, dueDate: null } }),
    'owner',
  );
  expect(saved.task.label).toBe('Edited');
  expect(saved.task.version).toBe(2);
  expect(saved.task).not.toHaveProperty('patch');
  expect(taskSyncPatch({ label: 'Legacy edit' })).toEqual({ label: 'Legacy edit' });
  expect(() => taskSyncPatch({ patch: { ownerId: 'other' } })).toThrow('protected');
});
it('rejects identity changes, unauthorized writes, and recreation through an update', async () => {
  await expect(
    saveSyncedTask(state.task, mutation({ patch: { label: 'Stolen' } }), 'other'),
  ).rejects.toThrow('owner');
  await expect(saveSyncedTask(undefined, mutation({ label: 'Gone' }), 'owner')).rejects.toThrow(
    'does not exist',
  );
  await expect(
    saveSyncedTask(
      undefined,
      { ...mutation(state.task, 'create'), baseVersion: 0, entityId: createUlid() },
      'owner',
    ),
  ).rejects.toThrow('identity');
});
it('syncs completion and undo with one event ID and reverses its count', async () => {
  const eventId = createUlid();
  const completed = await saveSyncedTask(
    state.task,
    mutation(
      { patch: { status: 'completed' }, completionEvent: { id: eventId } },
      'completeAndArchive',
    ),
    'owner',
  );
  expect(completed.task).toMatchObject({
    lifecycle: 'archived',
    completionState: 'completed',
    currentCompletionEventId: eventId,
  });
  expect(state.events.get(eventId)?.counted).toBe(true);
  const replayed = await saveSyncedTask(
    state.task,
    mutation(
      { patch: { status: 'completed' }, completionEvent: { id: eventId } },
      'completeAndArchive',
    ),
    'owner',
  );
  expect(replayed).toEqual({ task: completed.task, replayed: true });
  expect(state.events.size).toBe(1);
  expect(state.task?.version).toBe(2);
  await expect(
    saveSyncedTask(
      state.task,
      mutation(
        { patch: { status: 'completed' }, completionEvent: { id: createUlid() } },
        'completeAndArchive',
      ),
      'owner',
    ),
  ).rejects.toMatchObject({ classification: 'conflict', retryable: false });
  const restored = await saveSyncedTask(
    state.task,
    mutation({ patch: { status: 'open' } }, 'reopenAndRestore'),
    'owner',
  );
  expect(restored.task).toMatchObject({
    status: 'open',
    lifecycle: 'active',
    completionState: 'open',
    version: 3,
  });
  expect(state.events.size).toBe(1);
  expect(state.events.get(eventId)?.counted).toBe(false);
});
it('keeps a rebased local completion over a manual server archive', async () => {
  state.task = archiveTask(state.task!, 'owner');
  const eventId = createUlid();
  const completed = await saveSyncedTask(
    state.task,
    mutation(
      { patch: { status: 'completed' }, completionEvent: { id: eventId } },
      'completeAndArchive',
    ),
    'owner',
  );
  expect(completed.task).toMatchObject({
    status: 'archived',
    lifecycle: 'archived',
    completionState: 'completed',
    archiveReason: 'completed',
    currentCompletionEventId: eventId,
    version: 3,
  });
  expect(state.events.get(eventId)?.counted).toBe(true);
});
it('never overwrites another completion event using a supplied event ID', async () => {
  const id = createUlid();
  state.events.set(id, { id } as CompletionEvent);
  await expect(
    saveSyncedTask(
      state.task,
      mutation({ patch: { status: 'completed' }, completionEvent: { id } }, 'completeAndArchive'),
      'owner',
    ),
  ).rejects.toThrow('already exists');
  expect(state.task?.status).toBe('open');
});
