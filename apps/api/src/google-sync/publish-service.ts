import {
  googleTaskLinkSchema,
  type GoogleConnection,
  type GoogleTaskLink,
  type Task,
} from '@naaseh/domain';
import { listOwnerTasks } from '../shared/store.js';
import { findGoogleTaskSharing, findGoogleTaskLink, saveGoogleTaskLink } from './repository.js';
import { googleTaskSnapshot, taskSnapshot } from './merge-service.js';
import type { GoogleTasksClient } from './google-client.js';

export async function isGoogleTaskEligible(task: Task, connection: GoogleConnection) {
  if (
    task.ownerId !== connection.userId ||
    !task.dueAt ||
    !task.dueTimeZone ||
    task.lifecycle === 'deleting' ||
    (task.lifecycle === 'archived' && task.completionState !== 'completed') ||
    task.groupId ||
    task.assigneeId
  )
    return false;
  if (task.visibility !== 'private') return true;
  return (await findGoogleTaskSharing(task.id))?.approved === true;
}

export async function retireIneligibleGoogleTask(input: {
  connection: GoogleConnection;
  task: Task;
  client: GoogleTasksClient;
  now?: Date;
}) {
  const link = await findGoogleTaskLink(input.task.id);
  if (!link || link.state === 'retired') return { outcome: 'notLinked' as const };
  // Only remove provider content that Na'aseh originally created. Imported Google tasks remain.
  if (link.origin === 'naaseh')
    await input.client.deleteTask(link.googleTaskListId, link.googleTaskId);
  const now = (input.now ?? new Date()).toISOString();
  const retired = googleTaskLinkSchema.parse({
    ...link,
    state: 'retired',
    version: link.version + 1,
    updatedAt: now,
  });
  await saveGoogleTaskLink(retired, link.version);
  return { outcome: 'retired' as const, link: retired };
}

export async function previewGooglePublication(
  connection: GoogleConnection,
  client: GoogleTasksClient,
  taskListId: string,
) {
  const local = await listOwnerTasks(connection.userId);
  let publishCount = 0;
  let skippedPrivateCount = 0;
  for (const task of local) {
    if (!task.dueAt) continue;
    if (task.visibility === 'private' && !(await findGoogleTaskSharing(task.id))?.approved) {
      skippedPrivateCount += 1;
      continue;
    }
    if ((await isGoogleTaskEligible(task, connection)) && !(await findGoogleTaskLink(task.id)))
      publishCount += 1;
  }
  let importCount = 0;
  let skippedUndatedCount = 0;
  let pageToken: string | undefined;
  do {
    const page = await client.listTasks(taskListId, { ...(pageToken ? { pageToken } : {}) });
    for (const task of page.items ?? []) {
      if (task.deleted) continue;
      if (task.due) importCount += 1;
      else skippedUndatedCount += 1;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return {
    publishCount,
    importCount,
    skippedPrivateCount,
    skippedUndatedCount,
    conflictRiskCount: 0,
  };
}

export async function publishGoogleTask(input: {
  connection: GoogleConnection;
  task: Task;
  client: GoogleTasksClient;
  now?: Date;
}) {
  const { connection, task, client } = input;
  if (!connection.selectedTaskListId) throw new Error('Google task list is not selected.');
  if (!(await isGoogleTaskEligible(task, connection))) return { outcome: 'ineligible' as const };
  const snapshot = taskSnapshot(task);
  if (!snapshot) return { outcome: 'ineligible' as const };
  const existingLink = await findGoogleTaskLink(task.id);
  if (existingLink) {
    const remote = await client.patchTask(
      existingLink.googleTaskListId,
      existingLink.googleTaskId,
      {
        title: snapshot.title,
        dueDate: snapshot.dueDate,
        status: snapshot.status === 'completed' ? 'completed' : 'needsAction',
      },
    );
    const next = googleTaskLinkSchema.parse({
      ...existingLink,
      base: googleTaskSnapshot(remote) ?? snapshot,
      googleEtag: remote.etag,
      googleUpdatedAt: remote.updated,
      localVersion: task.version,
      state: 'linked',
      lastSyncedAt: (input.now ?? new Date()).toISOString(),
      version: existingLink.version + 1,
      updatedAt: (input.now ?? new Date()).toISOString(),
    });
    await saveGoogleTaskLink(next, existingLink.version);
    return { outcome: 'updated' as const, link: next };
  }
  const marker = `naaseh:${task.id}`;
  const found = await client.findMarker(connection.selectedTaskListId, marker);
  const remote =
    found ??
    (await client.createTask(connection.selectedTaskListId, {
      title: snapshot.title,
      dueDate: snapshot.dueDate,
      status: snapshot.status === 'completed' ? 'completed' : 'needsAction',
      notes: marker,
    }));
  const now = (input.now ?? new Date()).toISOString();
  const link: GoogleTaskLink = googleTaskLinkSchema.parse({
    connectionId: connection.id,
    userId: connection.userId,
    naasehTaskId: task.id,
    googleTaskId: remote.id,
    googleTaskListId: connection.selectedTaskListId,
    origin: 'naaseh',
    marker,
    base: googleTaskSnapshot(remote) ?? snapshot,
    googleEtag: remote.etag,
    googleUpdatedAt: remote.updated,
    localVersion: task.version,
    state: 'linked',
    lastSyncedAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now,
  });
  await saveGoogleTaskLink(link);
  return { outcome: found ? ('recovered' as const) : ('created' as const), link };
}
