import { describe, expect, it } from 'vitest';
import {
  archiveTask,
  canReadTask,
  canReadTaskAs,
  createTask,
  postItColorSchema,
  restoreArchivedTask,
  taskInputSchema,
  taskSchema,
} from './task.js';

describe('task boundaries', () => {
  it('allows all active users to read public tasks', () => {
    expect(
      canReadTask(createTask({ label: 'Call', visibility: 'public' }, 'steve'), 'friend'),
    ).toBe(true);
  });
  it('keeps unlocked grouped tasks globally readable while group membership controls discovery', () => {
    const grouped = createTask(
      { label: 'Neighborhood cleanup', visibility: 'public', groupId: 'neighbors' },
      'steve',
    );
    expect(
      canReadTaskAs(grouped, { id: 'friend', role: 'user', active: true, groupIds: [] }).allowed,
    ).toBe(true);
  });
  it('always persists an assignee and normalizes legacy owner-only tasks', () => {
    const created = createTask({ label: 'Call' }, 'steve');
    expect(created.assigneeId).toBe('steve');
    const { assigneeId: _missing, ...legacy } = created;
    expect(_missing).toBe('steve');
    expect(taskSchema.parse(legacy).assigneeId).toBe('steve');
    expect(taskSchema.safeParse({ ...legacy, ownerId: '' }).success).toBe(false);
  });
  it('restricts private tasks to their owner', () => {
    const task = createTask({ label: 'Secret', visibility: 'private' }, 'steve');
    expect(canReadTask(task, 'friend')).toBe(false);
    expect(canReadTask(task, 'steve')).toBe(true);
  });
  it('rejects the removed Extra Low priority', () => {
    expect(taskInputSchema.safeParse({ label: 'Old value', urgency: 'extra_low' }).success).toBe(
      false,
    );
  });
  it('accepts only the fixed semantic post-it palette and keeps the override optional', () => {
    expect(postItColorSchema.options).toEqual([
      'yellow',
      'pink',
      'blue',
      'green',
      'purple',
      'orange',
    ]);
    expect(createTask({ label: 'Default note' }, 'steve').postItColor).toBeUndefined();
    expect(createTask({ label: 'Pink note', postItColor: 'pink' }, 'steve').postItColor).toBe(
      'pink',
    );
    expect(taskInputSchema.safeParse({ label: 'Unsafe', postItColor: '#ffffff' }).success).toBe(
      false,
    );
  });
  it('keeps one membership epoch through edits and renews it after restoration', () => {
    const created = createTask(
      { label: 'Ranked work' },
      'steve',
      new Date('2026-08-05T12:00:00.000Z'),
    );
    const archived = archiveTask(created, 'steve', new Date('2026-08-06T12:00:00.000Z'));
    const restored = restoreArchivedTask(
      archived,
      undefined,
      'steve',
      undefined,
      new Date('2026-08-07T12:00:00.000Z'),
    ).task;

    expect(archived.stackMembershipEpoch).toBe(created.stackMembershipEpoch);
    expect(restored.stackMembershipEpoch).toBe('2026-08-07T12:00:00.000Z');
  });
});
