import { describe, expect, it } from 'vitest';
import { completeAndArchiveTask, createTask, restoreArchivedTask } from '../src/index.js';

describe('completion reporting events', () => {
  it('counts, reverses, and creates fresh historical snapshots when completed again', () => {
    const original = createTask(
      {
        label: 'Ship',
        projectId: '01J00000000000000000000020',
        categoryId: '01J00000000000000000000010',
      },
      'owner',
    );
    const first = completeAndArchiveTask(
      original,
      'owner',
      {
        projectId: '01J00000000000000000000020',
        projectName: 'API',
        categoryId: '01J00000000000000000000010',
        categoryName: 'PAAO',
      },
      new Date('2026-03-08T08:30:00.000Z'),
    );
    const reopened = restoreArchivedTask(
      first.task,
      first.completionEvent,
      'owner',
      'restore-1',
      new Date('2026-03-09T00:00:00.000Z'),
    );
    const second = completeAndArchiveTask(
      { ...reopened.task, projectId: undefined, categoryId: undefined },
      'owner',
      {},
      new Date('2026-03-10T00:00:00.000Z'),
    );
    expect(reopened.completionEvent).toMatchObject({
      counted: false,
      reversalMutationId: 'restore-1',
    });
    expect(second.completionEvent.id).not.toBe(first.completionEvent.id);
    expect(first.completionEvent).toMatchObject({
      projectNameAtCompletion: 'API',
      categoryNameAtCompletion: 'PAAO',
    });
    expect(second.completionEvent.projectIdAtCompletion).toBeUndefined();
  });
});
