import type { SyncChange, Task } from '@naaseh/domain';
import { administratorShard, feedAudience } from '../sync/change-feed-repository.js';

export type FeedChangeIntent = Omit<SyncChange, 'sequence'>;

function audienceFor(task: Task) {
  return task.visibility === 'public' ? 'PUBLIC' : `OWNER#${task.ownerId}`;
}

/**
 * Describe every audience change that must commit with a task mutation.
 * A privacy transition first removes the old audience's cached copy, then
 * publishes the new copy only to its newly authorized audience.
 */
export function privacyFeedChanges(previous: Task | undefined, next: Task): FeedChangeIntent[] {
  const upsert: FeedChangeIntent = {
    audience: audienceFor(next),
    entityId: next.id,
    operation: 'upsert',
    payload: next,
    changedAt: next.updatedAt,
  };
  if (!previous || previous.visibility === next.visibility) return [upsert];
  return [
    {
      audience: audienceFor(previous),
      entityId: next.id,
      operation: 'tombstone',
      changedAt: next.updatedAt,
    },
    upsert,
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
