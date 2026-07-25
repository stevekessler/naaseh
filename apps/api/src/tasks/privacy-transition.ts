import type { SyncChange, Task } from '@naaseh/domain';
import {
  administratorShard,
  contentAudiences,
  feedAudience,
} from '../sync/change-feed-repository.js';

export type FeedChangeIntent = Omit<SyncChange, 'sequence'>;

const taskAudiences = (task: Task) =>
  contentAudiences({
    entityId: task.id,
    ownerId: task.ownerId,
    locked: task.visibility === 'private',
    ...(task.groupId ? { groupId: task.groupId } : {}),
  }).filter((audience) => !audience.startsWith('ADMIN#'));

/**
 * Describe every audience change that must commit with a task mutation.
 * A privacy transition first removes the old audience's cached copy, then
 * publishes the new copy only to its newly authorized audience.
 */
export function privacyFeedChanges(previous: Task | undefined, next: Task): FeedChangeIntent[] {
  const before = previous ? taskAudiences(previous) : [];
  const after = taskAudiences(next);
  return [
    ...before
      .filter((audience) => !after.includes(audience))
      .map((audience) => ({
        audience,
        entityType: 'task' as const,
        entityId: next.id,
        version: next.version,
        operation: 'tombstone' as const,
        changedAt: next.updatedAt,
      })),
    ...after.map((audience) => ({
      audience,
      entityType: 'task' as const,
      entityId: next.id,
      version: next.version,
      operation: 'upsert' as const,
      payload: next,
      changedAt: next.updatedAt,
    })),
  ];
}

export function administratorTaskFeedChange(task: Task): FeedChangeIntent {
  return {
    audience: feedAudience.administrator(administratorShard(task.id)),
    entityType: 'task',
    entityId: task.id,
    version: task.version,
    operation: 'upsert',
    payload: task,
    changedAt: task.updatedAt,
  };
}
