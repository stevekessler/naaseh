import { describe, expect, it } from 'vitest';
import {
  archiveTask,
  completeAndArchiveTask,
  createTask,
  restoreArchivedTask,
} from '../src/index.js';

const now = new Date('2026-07-24T12:00:00.000Z');

describe('task archive lifecycle', () => {
  it('completes and archives atomically with durable completion credit', () => {
    const task = createTask({ label: 'Ship it' }, 'owner', now);
    const result = completeAndArchiveTask(task, 'owner', {}, now);
    expect(result.task).toMatchObject({ lifecycle: 'archived', completionState: 'completed' });
    expect(result.completionEvent.taskId).toBe(task.id);
    expect(result.completionEvent.counted).toBe(true);
  });

  it('manually archives without granting completion credit', () => {
    const task = createTask({ label: 'Pause it' }, 'owner', now);
    expect(archiveTask(task, 'owner', now)).toMatchObject({
      lifecycle: 'archived',
      completionState: 'open',
      archiveReason: 'manual',
    });
  });

  it('restores completed work and reverses exactly one completion event', () => {
    const initial = createTask({ label: 'Restore it' }, 'owner', now);
    const completed = completeAndArchiveTask(initial, 'owner', {}, now);
    const restored = restoreArchivedTask(
      completed.task,
      completed.completionEvent,
      'owner',
      '01J00000000000000000000000',
      new Date('2026-07-25T12:00:00.000Z'),
    );
    expect(restored.task).toMatchObject({ lifecycle: 'active', completionState: 'open' });
    expect(restored.completionEvent?.counted).toBe(false);
    expect(() => restoreArchivedTask(restored.task, restored.completionEvent, 'owner')).toThrow(
      'Only an archived task',
    );
  });
});
