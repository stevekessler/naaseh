import { describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';

const taskRepository = vi.hoisted(() => ({
  findTask: vi.fn(),
  findCompletionEvent: vi.fn(),
  saveTaskLifecycleMutation: vi.fn(),
}));
vi.mock('../../apps/api/src/tasks/task-repository.js', () => taskRepository);
vi.mock('../../apps/api/src/projects/project-repository.js', () => ({ getProject: vi.fn() }));
vi.mock('../../apps/api/src/categories/category-repository.js', () => ({ getCategory: vi.fn() }));

import { changeTaskLifecycle } from '../../apps/api/src/lifecycle/task-lifecycle-service.js';

describe('Google lifecycle attribution and replay identity', () => {
  it('records Google source on the existing completion revision transaction', async () => {
    const task = createTask(
      { label: 'Complete from Google' },
      'owner',
      new Date('2026-07-25T12:00:00Z'),
    );
    taskRepository.findTask.mockResolvedValue(task);
    await changeTaskLifecycle({
      taskId: task.id,
      actorId: 'owner',
      mutationId: 'google-complete:remote:etag',
      expectedVersion: task.version,
      action: 'complete',
      now: new Date('2026-07-25T13:00:00Z'),
      sourceClientId: 'google-tasks',
    });
    expect(taskRepository.saveTaskLifecycleMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'archived',
        lifecycle: 'archived',
        completionState: 'completed',
      }),
      task,
      'owner',
      'google-complete:remote:etag',
      'completeAndArchive',
      expect.objectContaining({ counted: true }),
      'google-tasks',
    );
  });
});
