import {
  createTask,
  createUlid,
  defaultUrgency,
  googleSyncConflictSchema,
  googleTaskLinkSchema,
  type GoogleConnection,
  type GoogleTaskLink,
  type Task,
} from '@naaseh/domain';
import { changeTaskLifecycle } from '../lifecycle/task-lifecycle-service.js';
import { findTask, saveTaskMutation } from '../tasks/task-repository.js';
import type { GoogleTask, GoogleTasksClient } from './google-client.js';
import {
  googleTaskSnapshot,
  mergeGoogleSnapshots,
  replaceTaskDueDate,
  taskSnapshot,
} from './merge-service.js';
import {
  findGoogleTaskLinkByRemote,
  saveGoogleConflict,
  saveGoogleTaskLink,
} from './repository.js';

const revisionKey = (remote: GoogleTask) =>
  (remote.etag ?? remote.updated ?? `${remote.id}:${remote.status}:${remote.due ?? 'undated'}`)
    .replace(/[^A-Za-z0-9_.:-]/g, '')
    .slice(0, 160);

async function archiveRemoteDeletion(
  connection: GoogleConnection,
  link: GoogleTaskLink,
  remote: GoogleTask,
  now: Date,
) {
  const current = await findTask(link.naasehTaskId);
  if (current && current.lifecycle !== 'archived')
    await changeTaskLifecycle({
      taskId: current.id,
      actorId: connection.userId,
      mutationId: `google-delete:${remote.id}:${revisionKey(remote)}`,
      expectedVersion: current.version,
      action: 'archive',
      now,
      sourceClientId: 'google-tasks',
    });
  const timestamp = now.toISOString();
  const next = googleTaskLinkSchema.parse({
    ...link,
    state: 'remoteDeleted',
    googleEtag: remote.etag,
    googleUpdatedAt: remote.updated,
    version: link.version + 1,
    updatedAt: timestamp,
  });
  await saveGoogleTaskLink(next, link.version);
  return { outcome: 'remoteDeleted' as const, link: next };
}

export async function applyMergedLocal(
  connection: GoogleConnection,
  current: Task,
  merged: NonNullable<ReturnType<typeof googleTaskSnapshot>>,
  remote: GoogleTask,
  now: Date,
) {
  let task = current;
  const currentSnapshot = taskSnapshot(task);
  if (!currentSnapshot) throw new Error('Linked Naaseh task no longer has a due date.');
  const patch: Partial<Task> = {};
  if (merged.title !== currentSnapshot.title) patch.label = merged.title;
  if (merged.dueDate !== currentSnapshot.dueDate)
    Object.assign(
      patch,
      replaceTaskDueDate(
        task,
        merged.dueDate,
        connection.defaultLocalTime,
        connection.defaultTimeZone,
      ),
    );
  if (Object.keys(patch).length) {
    const changedFields = Object.keys(patch);
    const next = {
      ...task,
      ...patch,
      urgency: task.urgency,
      version: task.version + 1,
      updatedAt: now.toISOString(),
    };
    const result = await saveTaskMutation(
      next,
      connection.userId,
      `google-update:${remote.id}:${revisionKey(remote)}:${task.version}`,
      'update',
      changedFields,
      task,
      undefined,
      'google-tasks',
    );
    task = result.task;
  }
  const completed = task.completionState === 'completed' || task.status === 'completed';
  if (merged.status === 'completed' && !completed)
    task = await changeTaskLifecycle({
      taskId: task.id,
      actorId: connection.userId,
      mutationId: `google-complete:${remote.id}:${revisionKey(remote)}`,
      expectedVersion: task.version,
      action: 'complete',
      now,
      sourceClientId: 'google-tasks',
    });
  if (merged.status === 'open' && completed)
    task = await changeTaskLifecycle({
      taskId: task.id,
      actorId: connection.userId,
      mutationId: `google-reopen:${remote.id}:${revisionKey(remote)}`,
      expectedVersion: task.version,
      action: 'restore',
      now,
      sourceClientId: 'google-tasks',
    });
  return task;
}

export async function importGoogleTask(input: {
  connection: GoogleConnection;
  remote: GoogleTask;
  client: GoogleTasksClient;
  now?: Date;
}) {
  const { connection, remote, client } = input;
  const now = input.now ?? new Date();
  const existingLink = await findGoogleTaskLinkByRemote(connection.id, remote.id);
  if (remote.deleted) {
    if (!existingLink) return { outcome: 'ignoredDeletion' as const };
    return archiveRemoteDeletion(connection, existingLink, remote, now);
  }
  const remoteSnapshot = googleTaskSnapshot(remote);
  if (!remoteSnapshot) return { outcome: 'skippedUndated' as const };

  if (!existingLink) {
    const due = replaceTaskDueDate(
      {},
      remoteSnapshot.dueDate,
      connection.defaultLocalTime,
      connection.defaultTimeZone,
    );
    let task = createTask(
      {
        label: remoteSnapshot.title,
        ...due,
        visibility: 'public',
        urgency: defaultUrgency,
      },
      connection.userId,
      now,
    );
    await saveTaskMutation(
      task,
      connection.userId,
      `google-import:${remote.id}:${revisionKey(remote)}`,
      'create',
      ['label', 'dueAt', 'dueTimeZone', 'visibility', 'urgency'],
      undefined,
      undefined,
      'google-tasks',
    );
    if (remoteSnapshot.status === 'completed')
      task = await changeTaskLifecycle({
        taskId: task.id,
        actorId: connection.userId,
        mutationId: `google-complete:${remote.id}:${revisionKey(remote)}`,
        expectedVersion: task.version,
        action: 'complete',
        now,
        sourceClientId: 'google-tasks',
      });
    const timestamp = now.toISOString();
    const link = googleTaskLinkSchema.parse({
      connectionId: connection.id,
      userId: connection.userId,
      naasehTaskId: task.id,
      googleTaskId: remote.id,
      googleTaskListId: connection.selectedTaskListId,
      origin: 'google',
      base: remoteSnapshot,
      googleEtag: remote.etag,
      googleUpdatedAt: remote.updated,
      localVersion: task.version,
      state: 'linked',
      lastSyncedAt: timestamp,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    await saveGoogleTaskLink(link);
    return { outcome: 'imported' as const, task, link };
  }

  const localTask = await findTask(existingLink.naasehTaskId);
  if (!localTask) throw new Error('Linked Naaseh task is unavailable.');
  const localSnapshot = taskSnapshot(localTask);
  if (!localSnapshot) throw new Error('Linked Naaseh task is no longer dated.');
  const merge = mergeGoogleSnapshots(existingLink.base, localSnapshot, remoteSnapshot);
  if (merge.conflicts.length) {
    for (const conflict of merge.conflicts) {
      const id = createUlid(now.getTime());
      await saveGoogleConflict(
        googleSyncConflictSchema.parse({
          id,
          connectionId: connection.id,
          userId: connection.userId,
          taskId: localTask.id,
          field: conflict.field,
          baseValue: conflict.baseValue,
          localValue: conflict.localValue,
          remoteValue: conflict.remoteValue,
          detectedLocalVersion: localTask.version,
          detectedLinkVersion: existingLink.version,
          state: 'open',
          version: 1,
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
        }),
      );
    }
    const conflicted = googleTaskLinkSchema.parse({
      ...existingLink,
      state: 'conflicted',
      version: existingLink.version + 1,
      updatedAt: now.toISOString(),
    });
    await saveGoogleTaskLink(conflicted, existingLink.version);
    return { outcome: 'conflicted' as const, conflicts: merge.conflicts };
  }

  const task = await applyMergedLocal(connection, localTask, merge.merged, remote, now);
  if (JSON.stringify(merge.merged) !== JSON.stringify(remoteSnapshot))
    await client.patchTask(existingLink.googleTaskListId, existingLink.googleTaskId, {
      title: merge.merged.title,
      dueDate: merge.merged.dueDate,
      status: merge.merged.status === 'completed' ? 'completed' : 'needsAction',
    });
  const next = googleTaskLinkSchema.parse({
    ...existingLink,
    base: merge.merged,
    googleEtag: remote.etag,
    googleUpdatedAt: remote.updated,
    localVersion: task.version,
    state: 'linked',
    lastSyncedAt: now.toISOString(),
    version: existingLink.version + 1,
    updatedAt: now.toISOString(),
  });
  await saveGoogleTaskLink(next, existingLink.version);
  return { outcome: 'merged' as const, task, link: next };
}
