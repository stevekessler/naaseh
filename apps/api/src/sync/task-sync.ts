import { taskSchema, transitionTask, type Mutation, type Task } from '@naaseh/domain';
import { sanitizeTaskPatch } from '../tasks/task-service.js';
import { changeTaskLifecycle } from '../lifecycle/task-lifecycle-service.js';
import { SafeApiError } from '../shared/http.js';
import { findCompletionEvent, saveTaskMutation } from '../tasks/task-repository.js';
import { notifyStackMembershipWorkChange } from '../ranking/stack-membership-lifecycle.js';

/** Accept the encrypted browser outbox envelope as well as legacy flat patches. */
export function taskSyncPatch(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload))
    throw new Error('Task payload must be an object.');
  const envelope = payload as Record<string, unknown>;
  if (
    'patch' in envelope &&
    Object.keys(envelope).some((key) => !['patch', 'completionEvent'].includes(key))
  )
    throw new Error('Task update envelope contains an unsupported field.');
  return sanitizeTaskPatch('patch' in envelope ? envelope.patch : envelope);
}

export async function saveSyncedTask(
  current: Task | undefined,
  mutation: Mutation,
  actorId: string,
  sourceClientId?: string,
) {
  if (current && current.ownerId !== actorId)
    throw new Error('Only the owner may change this task.');
  if (!current) {
    if (mutation.operation !== 'create' || mutation.baseVersion !== 0)
      throw new Error('Task does not exist.');
    const next = taskSchema.parse(mutation.payload);
    if (next.id !== mutation.entityId || next.ownerId !== actorId || next.version !== 1)
      throw new Error('Task identity or version is invalid.');
    const saved = await saveTaskMutation(
      next,
      actorId,
      mutation.id,
      'create',
      Object.keys(next),
      undefined,
      undefined,
      sourceClientId,
    );
    if (!saved.replayed) notifyStackMembershipWorkChange('task', undefined, saved.task, 'create');
    return saved;
  }
  const patch = taskSyncPatch(mutation.payload);
  const action =
    patch.status === 'completed'
      ? 'complete'
      : patch.status === 'archived'
        ? 'archive'
        : patch.status === 'open' &&
            (current.lifecycle === 'archived' || current.status === 'archived')
          ? 'restore'
          : undefined;
  let replaceManualArchiveWithCompletion = false;
  if (action) {
    if (Object.keys(patch).some((key) => key !== 'status'))
      throw new Error('Lifecycle changes must be separate from task edits.');
    const envelope = mutation.payload as { completionEvent?: { id?: string } };
    if (
      action === 'complete' &&
      (current.lifecycle === 'archived' || current.status === 'archived')
    ) {
      const eventId = envelope.completionEvent?.id;
      const event =
        eventId && current.currentCompletionEventId === eventId
          ? await findCompletionEvent(eventId)
          : undefined;
      // A conflict resolution has a new mutation ID, but the original completion
      // event still identifies an already-applied action. Never count it twice.
      if (
        current.completionState === 'completed' &&
        event &&
        event.taskId === current.id &&
        event.completedBy === actorId &&
        event.counted &&
        !event.reversedAt
      )
        return { task: current, replayed: true };
      if (
        eventId &&
        current.completionState !== 'completed' &&
        current.archiveReason !== 'completed'
      )
        replaceManualArchiveWithCompletion = true;
      else
        throw new SafeApiError(
          409,
          'lifecycle_changed',
          'This task is already completed or archived. Review the current version before completing it.',
          'conflict',
        );
    }

    const task = await changeTaskLifecycle({
      taskId: current.id,
      actorId,
      mutationId: mutation.id,
      expectedVersion: mutation.baseVersion,
      action,
      now: new Date(mutation.createdAt),
      ...(sourceClientId ? { sourceClientId } : {}),
      ...(action === 'complete' && envelope.completionEvent?.id
        ? { completionEventId: envelope.completionEvent.id }
        : {}),
      ...(replaceManualArchiveWithCompletion ? { replaceManualArchiveWithCompletion: true } : {}),
    });
    return { task, replayed: false };
  }
  const transitioned =
    patch.status && patch.status !== current.status
      ? transitionTask(current, patch.status, actorId, new Date(mutation.createdAt))
      : { ...current, version: current.version + 1, updatedAt: mutation.createdAt };
  const next = taskSchema.parse({ ...transitioned, ...patch });
  const saved = await saveTaskMutation(
    next,
    actorId,
    mutation.id,
    'update',
    Object.keys(patch),
    current,
    undefined,
    sourceClientId,
  );
  if (!saved.replayed) notifyStackMembershipWorkChange('task', current, saved.task);
  return saved;
}
