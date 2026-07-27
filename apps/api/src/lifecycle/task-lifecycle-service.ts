import {
  archiveTask,
  completeAndArchiveTask,
  restoreArchivedTask,
  type Task,
} from '@naaseh/domain';
import {
  findCompletionEvent,
  findTask,
  saveTaskLifecycleMutation,
} from '../tasks/task-repository.js';
import { getProject } from '../projects/project-repository.js';
import { getCategory } from '../categories/category-repository.js';

export interface TaskLifecycleRequest {
  taskId: string;
  actorId: string;
  mutationId: string;
  expectedVersion: number;
  action: 'complete' | 'archive' | 'restore';
  now?: Date;
  sourceClientId?: string;
}

export async function changeTaskLifecycle(request: TaskLifecycleRequest): Promise<Task> {
  const current = await findTask(request.taskId);
  if (!current || current.ownerId !== request.actorId) throw new Error('Task not found.');
  if (current.version !== request.expectedVersion) throw new Error('Task version changed.');
  const now = request.now ?? new Date();
  if (request.action === 'complete') {
    let attribution = {};
    if (current.projectId) {
      const project = await getProject(current.projectId);
      const category = project ? await getCategory(project.categoryId) : undefined;
      if (project && category)
        attribution = {
          projectId: project.id,
          projectName: project.name,
          categoryId: category.id,
          categoryName: category.name,
        };
    }
    const result = completeAndArchiveTask(current, request.actorId, attribution, now);
    await saveTaskLifecycleMutation(
      result.task,
      current,
      request.actorId,
      request.mutationId,
      'completeAndArchive',
      result.completionEvent,
      request.sourceClientId,
    );
    return result.task;
  }
  if (request.action === 'archive') {
    const next = archiveTask(current, request.actorId, now);
    await saveTaskLifecycleMutation(
      next,
      current,
      request.actorId,
      request.mutationId,
      'archive',
      undefined,
      request.sourceClientId,
    );
    return next;
  }
  const event = current.currentCompletionEventId
    ? await findCompletionEvent(current.currentCompletionEventId)
    : undefined;
  const restored = restoreArchivedTask(current, event, request.actorId, request.mutationId, now);
  await saveTaskLifecycleMutation(
    restored.task,
    current,
    request.actorId,
    request.mutationId,
    'reopenAndRestore',
    restored.completionEvent,
    request.sourceClientId,
  );
  return restored.task;
}
