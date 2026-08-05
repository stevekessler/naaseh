import { describe, expect, it, vi } from 'vitest';
import {
  archiveList,
  archiveTask,
  createList,
  createTask,
  restoreArchivedTask,
  restoreList,
} from '@naaseh/domain';
import { prepareTaskUpdate } from '../../apps/api/src/tasks/task-service.js';
import { saveTaskMutation } from '../../apps/api/src/tasks/task-repository.js';
import { updateOwnedList } from '../../apps/api/src/lists/list-service.js';

const now = new Date('2026-08-05T12:00:00.000Z');

describe('urgency work integration', () => {
  it('defaults new Tasks, subtasks, and Lists to Medium and persists explicit values', () => {
    const parent = createTask({ label: 'Parent', urgency: 'critical' }, 'owner', now);
    const subtask = createTask({ label: 'Child', parentId: parent.id }, 'owner', now);
    const list = createList({ name: 'Errands', urgency: 'extra_low' }, 'owner', now);
    const defaultList = createList({ name: 'Default' }, 'owner', now);

    expect(parent.urgency).toBe('critical');
    expect(subtask.urgency).toBe('medium');
    expect(list.urgency).toBe('extra_low');
    expect(defaultList.urgency).toBe('medium');
  });

  it('uses existing edit authorization and records urgency in revision history', async () => {
    const current = createTask({ label: 'Owned' }, 'owner', now);
    expect(() =>
      prepareTaskUpdate(current, { urgency: 'high' }, 'intruder', new Map([[current.id, current]])),
    ).toThrow('Only the owner');

    const prepared = prepareTaskUpdate(
      current,
      { urgency: 'high' },
      'owner',
      new Map([[current.id, current]]),
      undefined,
      new Date('2026-08-05T12:01:00.000Z'),
    );
    const commit = vi.fn().mockResolvedValue(undefined);
    const saved = await saveTaskMutation(
      prepared.task,
      'owner',
      'mutation-1',
      'update',
      prepared.changedFields,
      current,
      {
        prepareChange: vi.fn(async (change) => ({ expectedSequence: 0, change })),
        commit,
        findResult: vi.fn().mockResolvedValue(undefined),
        administratorFeed: false,
      },
    );

    expect(prepared.task.urgency).toBe('high');
    expect(prepared.changedFields).toContain('urgency');
    expect(saved.revision.before).toMatchObject({ urgency: 'medium' });
    expect(saved.revision.after).toMatchObject({ urgency: 'high' });
    expect(commit).toHaveBeenCalledOnce();
  });

  it('preserves urgency through archive and restore for Tasks and Lists', () => {
    const task = createTask({ label: 'Keep me', urgency: 'low' }, 'owner', now);
    const archivedTask = archiveTask(task, 'owner', new Date('2026-08-05T12:01:00.000Z'));
    const restoredTask = restoreArchivedTask(
      archivedTask,
      undefined,
      'owner',
      undefined,
      new Date('2026-08-05T12:02:00.000Z'),
    ).task;
    const list = createList({ name: 'Keep list', urgency: 'high' }, 'owner', now);
    const archivedList = archiveList(list, 'owner', new Date('2026-08-05T12:01:00.000Z'));
    const restoredList = restoreList(archivedList, 'owner', new Date('2026-08-05T12:02:00.000Z'));

    expect(restoredTask.urgency).toBe('low');
    expect(restoredList.urgency).toBe('high');
  });

  it('changes urgency without deriving or changing personal rank', () => {
    const task = Object.assign(createTask({ label: 'Independent' }, 'owner', now), {
      overallPosition: 5,
      projectPosition: 1,
    });
    const updated = prepareTaskUpdate(
      task,
      { urgency: 'critical' },
      'owner',
      new Map([[task.id, task]]),
    ).task as typeof task;
    const list = createList({ name: 'Owned list' }, 'owner', now);

    expect(updated).toMatchObject({ urgency: 'critical', overallPosition: 5, projectPosition: 1 });
    expect(() => updateOwnedList(list, { urgency: 'low' }, 'intruder')).toThrow('Only the owner');
    expect(updateOwnedList(list, { urgency: 'low' }, 'owner').urgency).toBe('low');
  });
});
