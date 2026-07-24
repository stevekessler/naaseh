import type { CategoryRecord, Task } from '@naaseh/domain';
import { setTaskLocked, transitionTask } from '@naaseh/domain';
import { applyCategoryDefaults, assertNoCycle, safeTaskUrl } from './task-policy.js';

export interface PreparedTaskUpdate {
  task: Task;
  changedFields: string[];
  operation: 'update' | 'complete' | 'reopen' | 'archive' | 'restore';
  noChange: boolean;
}
export const prepareTaskLock = (
  current: Task,
  locked: boolean,
  actorId: string,
  now = new Date(),
) => ({
  task: setTaskLocked(current, locked, actorId, now),
  changedFields: ['visibility'],
  operation: locked ? ('lock' as const) : ('unlock' as const),
  noChange: (current.visibility === 'private') === locked,
});

const mutableTaskFields = new Set<keyof Task>([
  'label',
  'link',
  'memo',
  'memoHidden',
  'encryptedMemo',
  'dueAt',
  'dueTimeZone',
  'assigneeId',
  'categoryId',
  'groupId',
  'parentId',
  'visibility',
  'status',
]);

/** Reject ownership, version, and server-metadata fields before any object merge. */
export function sanitizeTaskPatch(value: unknown): Partial<Task> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Task patch must be an object.');
  const entries = Object.entries(value);
  if (!entries.length) throw new Error('Task patch cannot be empty.');
  if (entries.some(([field]) => !mutableTaskFields.has(field as keyof Task)))
    throw new Error('Task patch contains a protected field.');
  return Object.fromEntries(entries) as Partial<Task>;
}

export function prepareTaskUpdate(
  current: Task,
  patch: Partial<Task>,
  actorId: string,
  tasks: Map<string, Task>,
  category?: CategoryRecord,
  now = new Date(),
): PreparedTaskUpdate {
  if (current.ownerId !== actorId) throw new Error('Only the owner may change this task.');
  if (patch.link !== undefined) safeTaskUrl(patch.link);
  if (patch.parentId !== undefined) assertNoCycle(current.id, patch.parentId, tasks);
  const normalized = applyCategoryDefaults(patch, category);
  const changedFields = Object.keys(normalized).filter(
    (field) => normalized[field as keyof Task] !== current[field as keyof Task],
  );
  if (changedFields.length === 0)
    return { task: current, changedFields: [], operation: 'update', noChange: true };
  const requestedStatus = normalized.status;
  const transitioned =
    requestedStatus && requestedStatus !== current.status
      ? transitionTask(current, requestedStatus, actorId, now)
      : { ...current, updatedAt: now.toISOString(), version: current.version + 1 };
  const task = { ...transitioned, ...normalized };
  const operation =
    requestedStatus === 'completed'
      ? 'complete'
      : requestedStatus === 'open'
        ? 'reopen'
        : requestedStatus === 'archived'
          ? 'archive'
          : current.status === 'archived'
            ? 'restore'
            : 'update';
  return { task, changedFields, operation, noChange: false };
}
