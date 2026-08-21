import type { CompletionEvent, ExportJob, Task } from '@naaseh/domain';
import { completionLocalDate } from '../reporting/completion-report-service.js';
import type { CompletionExportMetadata } from './csv-transformer.js';

export function completionExportReadAccess(
  job: ExportJob | undefined,
  actorId: string,
  currentGroupIds: readonly string[],
): 'allowed' | 'not_found' | 'authorization_changed' {
  if (!job || job.requestedByPrincipal !== actorId || job.exportKind !== 'completed_tasks')
    return 'not_found';
  if (
    job.scope === 'self' &&
    JSON.stringify([...currentGroupIds].sort()) !==
      JSON.stringify([...(job.authorizedGroupIds ?? [])].sort())
  )
    return 'authorization_changed';
  return 'allowed';
}

export function authorizeCompletionExportTask(
  task: Task,
  event: CompletionEvent | undefined,
  job: ExportJob,
) {
  if (!event?.counted || event.occurredAt > job.snapshotTime) return false;
  if (job.scope === 'all_users') return job.adminConfirmed === true;
  if (event.completedBy !== job.requestedByPrincipal) return false;
  if (task.ownerId === job.requestedByPrincipal) return true;
  if (task.visibility === 'private') return false;
  if (task.groupId && !(job.authorizedGroupIds ?? []).includes(task.groupId)) return false;
  return true;
}

export function completionExportFilterMatches(event: CompletionEvent, job: ExportJob) {
  const filters = job.normalizedFilters ?? {};
  const localDate = completionLocalDate(event.occurredAt, job.browserTimeZone ?? 'UTC');
  if (typeof filters.from === 'string' && localDate < filters.from) return false;
  if (typeof filters.to === 'string' && localDate > filters.to) return false;
  if (filters.categoryId && event.categoryIdAtCompletion !== filters.categoryId) return false;
  if (filters.projectId && event.projectIdAtCompletion !== filters.projectId) return false;
  if (
    Array.isArray(filters.urgencies) &&
    filters.urgencies.length &&
    !filters.urgencies.includes(event.urgencyAtCompletion)
  )
    return false;
  return true;
}

export function completionExportMetadata(
  task: Task,
  event: CompletionEvent,
): CompletionExportMetadata {
  return {
    completionVersion: task.version,
    ...(event.categoryNameAtCompletion ? { categoryLabel: event.categoryNameAtCompletion } : {}),
    ...(event.projectNameAtCompletion ? { projectLabel: event.projectNameAtCompletion } : {}),
    ...(event.reversedAt ? { completionReversedAt: event.reversedAt } : {}),
  };
}
