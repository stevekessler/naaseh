import {
  googleConnectionSchema,
  googleSyncConflictSchema,
  googleTaskLinkSchema,
  googleTaskSharingConsentSchema,
  type GoogleConnection,
  type GoogleSyncConflict,
} from '@naaseh/domain';
import { findTask } from '../tasks/task-repository.js';
import { googleClientForConnection, revokeGoogleConnectionToken } from './auth-service.js';
import { applyMergedLocal } from './import-service.js';
import { taskSnapshot } from './merge-service.js';
import {
  findGoogleConflict,
  findGoogleConnection,
  findGoogleTaskLink,
  listGoogleTaskLinks,
  saveGoogleConnection,
  saveGoogleTaskLink,
  saveGoogleTaskSharing,
  updateGoogleConflict,
} from './repository.js';

export const publicGoogleStatus = (connection: GoogleConnection | undefined) =>
  connection
    ? {
        state: connection.state,
        connectionId: connection.id,
        selectedTaskListTitle: connection.selectedTaskListTitle,
        defaultLocalTime: connection.defaultLocalTime,
        defaultTimeZone: connection.defaultTimeZone,
        version: connection.version,
        lastAttemptAt: connection.lastAttemptAt,
        lastSuccessAt: connection.lastSuccessAt,
        pendingCount: connection.pendingCount,
        conflictCount: connection.conflictCount,
        quarantineCount: connection.quarantineCount,
        skippedUndatedCount: connection.skippedUndatedCount,
      }
    : {
        state: 'disconnected' as const,
        pendingCount: 0,
        conflictCount: 0,
        quarantineCount: 0,
        skippedUndatedCount: 0,
      };

export async function updateGoogleSettings(input: {
  userId: string;
  expectedVersion: number;
  selectedTaskListId?: string;
  selectedTaskListTitle?: string;
  defaultLocalTime?: string;
  defaultTimeZone?: string;
  state?: 'active' | 'paused';
  listChangeMode?: 'leavePrevious' | 'deleteNaasehOriginPrevious';
  now?: Date;
}) {
  const current = await findGoogleConnection(input.userId);
  if (!current || current.version !== input.expectedVersion)
    throw new Error('Google connection changed.');
  if (input.selectedTaskListId) {
    const lists = await (await googleClientForConnection(current)).listTaskLists();
    const selected = lists.find((list) => list.id === input.selectedTaskListId);
    if (!selected) throw new Error('Selected Google task list is unavailable.');
    if (input.selectedTaskListTitle && input.selectedTaskListTitle !== selected.title)
      throw new Error('Selected Google task list changed.');
  }
  const changingList = Boolean(
    input.selectedTaskListId &&
      current.selectedTaskListId &&
      input.selectedTaskListId !== current.selectedTaskListId,
  );
  if (changingList) {
    const client = await googleClientForConnection(current);
    for (const link of await listGoogleTaskLinks(current.id)) {
      if (link.state === 'retired' || link.googleTaskListId !== current.selectedTaskListId)
        continue;
      if (input.listChangeMode === 'deleteNaasehOriginPrevious' && link.origin === 'naaseh')
        await client.deleteTask(link.googleTaskListId, link.googleTaskId).catch(() => undefined);
      await saveGoogleTaskLink(
        googleTaskLinkSchema.parse({
          ...link,
          state: 'retired',
          version: link.version + 1,
          updatedAt: (input.now ?? new Date()).toISOString(),
        }),
        link.version,
      );
    }
  }
  const next = googleConnectionSchema.parse({
    ...current,
    ...(input.selectedTaskListId ? { selectedTaskListId: input.selectedTaskListId } : {}),
    ...(input.selectedTaskListTitle ? { selectedTaskListTitle: input.selectedTaskListTitle } : {}),
    ...(input.defaultLocalTime ? { defaultLocalTime: input.defaultLocalTime } : {}),
    ...(input.defaultTimeZone ? { defaultTimeZone: input.defaultTimeZone } : {}),
    ...(input.state ? { state: input.state } : {}),
    ...(changingList ? { checkpointAt: undefined } : {}),
    version: current.version + 1,
    updatedAt: (input.now ?? new Date()).toISOString(),
  });
  return saveGoogleConnection(next, current.version);
}

export async function setGoogleTaskSharing(input: {
  userId: string;
  taskId: string;
  approved: boolean;
  expectedVersion: number;
  now?: Date;
}) {
  const task = await findTask(input.taskId);
  if (!task || task.ownerId !== input.userId || task.visibility !== 'private')
    throw new Error('Private task not found.');
  return saveGoogleTaskSharing(
    googleTaskSharingConsentSchema.parse({
      taskId: task.id,
      userId: input.userId,
      approved: input.approved,
      version: input.expectedVersion + 1,
      updatedAt: (input.now ?? new Date()).toISOString(),
    }),
    input.expectedVersion,
  );
}

export async function resolveGoogleSyncConflict(input: {
  userId: string;
  conflictId: string;
  source: 'local' | 'google' | 'edited';
  editedValue?: string;
  expectedVersion: number;
  now?: Date;
}) {
  const connection = await findGoogleConnection(input.userId);
  if (!connection) throw new Error('Google connection not found.');
  const conflict = await findGoogleConflict(connection.id, input.conflictId);
  if (!conflict || conflict.userId !== input.userId || conflict.state !== 'open')
    throw new Error('Google conflict not found.');
  if (conflict.version !== input.expectedVersion) throw new Error('Google conflict changed.');
  const link = await findGoogleTaskLink(conflict.taskId);
  const task = await findTask(conflict.taskId);
  if (!link || !task || link.connectionId !== connection.id)
    throw new Error('Linked task not found.');
  if (
    link.version !== conflict.detectedLinkVersion ||
    task.version !== conflict.detectedLocalVersion
  )
    throw new Error('Conflict is stale. Refresh before resolving.');
  const value =
    input.source === 'local'
      ? conflict.localValue
      : input.source === 'google'
        ? conflict.remoteValue
        : input.editedValue;
  if (value === undefined) throw new Error('Edited conflict resolution requires a value.');
  const desired = { ...(taskSnapshot(task) ?? link.base), [conflict.field]: value };
  if (conflict.field === 'status' && !['open', 'completed'].includes(value))
    throw new Error('Conflict status resolution is invalid.');
  const client = await googleClientForConnection(connection);
  const remote = await client.getTask(link.googleTaskListId, link.googleTaskId);
  const now = input.now ?? new Date();
  const nextTask = await applyMergedLocal(connection, task, desired, remote, now);
  await client.patchTask(link.googleTaskListId, link.googleTaskId, {
    title: desired.title,
    dueDate: desired.dueDate,
    status: desired.status === 'completed' ? 'completed' : 'needsAction',
  });
  const nextLink = googleTaskLinkSchema.parse({
    ...link,
    base: desired,
    localVersion: nextTask.version,
    state: 'linked',
    lastSyncedAt: now.toISOString(),
    version: link.version + 1,
    updatedAt: now.toISOString(),
  });
  await saveGoogleTaskLink(nextLink, link.version);
  const resolved: GoogleSyncConflict = googleSyncConflictSchema.parse({
    ...conflict,
    state: 'resolved',
    resolutionSource: input.source,
    resolvedValue: value,
    resolvedBy: input.userId,
    resolvedAt: now.toISOString(),
    version: conflict.version + 1,
    updatedAt: now.toISOString(),
  });
  await updateGoogleConflict(resolved, conflict.version);
  return resolved;
}

export function summarizeGoogleLinks(links: Array<{ state: string; origin: 'naaseh' | 'google' }>) {
  return {
    linkedCount: links.filter((link) => link.state !== 'retired').length,
    naasehOriginCount: links.filter((link) => link.state !== 'retired' && link.origin === 'naaseh')
      .length,
  };
}

export async function googleDisconnectPreview(userId: string) {
  const connection = await findGoogleConnection(userId);
  if (!connection) return { linkedCount: 0, naasehOriginCount: 0 };
  return summarizeGoogleLinks(await listGoogleTaskLinks(connection.id));
}

export async function disconnectGoogle(input: {
  userId: string;
  expectedVersion: number;
  cleanup: 'retain' | 'deleteNaasehOrigin';
  now?: Date;
}) {
  const connection = await findGoogleConnection(input.userId);
  if (!connection || connection.version !== input.expectedVersion)
    throw new Error('Google connection changed.');
  const now = input.now ?? new Date();
  const client = await googleClientForConnection(connection);
  const links = await listGoogleTaskLinks(connection.id);
  if (input.cleanup === 'deleteNaasehOrigin')
    for (const link of links)
      if (link.origin === 'naaseh' && link.state !== 'retired')
        await client.deleteTask(link.googleTaskListId, link.googleTaskId).catch(() => undefined);
  for (const link of links) {
    if (link.state === 'retired') continue;
    await saveGoogleTaskLink(
      googleTaskLinkSchema.parse({
        ...link,
        state: 'retired',
        version: link.version + 1,
        updatedAt: now.toISOString(),
      }),
      link.version,
    );
  }
  await revokeGoogleConnectionToken(connection).catch(() => undefined);
  const disconnected = googleConnectionSchema.parse({
    ...connection,
    state: 'disconnected',
    selectedTaskListId: undefined,
    selectedTaskListTitle: undefined,
    encryptedRefreshToken: undefined,
    tokenKeyVersion: undefined,
    scope: undefined,
    checkpointAt: undefined,
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
    pendingCount: 0,
    conflictCount: 0,
    quarantineCount: 0,
    skippedUndatedCount: 0,
    version: connection.version + 1,
    updatedAt: now.toISOString(),
  });
  return saveGoogleConnection(disconnected, connection.version);
}
