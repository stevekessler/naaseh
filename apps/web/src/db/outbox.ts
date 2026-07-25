import type { VectorCursor } from '@naaseh/domain';
import type { StoredMutation, EncryptedTaskRecord, EncryptedEntityRecord } from './database.js';
import { db } from './database.js';
export async function atomicEntityAndMutation(
  entity: EncryptedTaskRecord,
  mutation: StoredMutation,
) {
  await db.transaction('rw', db.secureTasks, db.outbox, async () => {
    await db.secureTasks.put(entity);
    await db.outbox.add(mutation);
  });
}
const encryptedStoreFor = (entityType: StoredMutation['entityType']) => {
  switch (entityType) {
    case 'category':
      return db.secureCategories;
    case 'list':
      return db.secureLists;
    case 'listItem':
      return db.secureListItems;
    case 'directoryItem':
      return db.secureDirectoryItems;
    case 'attachment':
      return db.secureAttachments;
    case 'copyJob':
      return db.secureJobs;
    case 'project':
      return db.secureProjects;
    case 'completionEvent':
      return db.secureCompletionEvents;
    case 'deletionJob':
      return db.secureDeletionJobs;
    case 'accessControl':
      return db.secureGroups;
    default:
      throw new Error(`Entity type ${entityType} does not use the generic encrypted store`);
  }
};

export async function atomicEncryptedEntityAndMutation(
  entity: EncryptedEntityRecord,
  mutation: StoredMutation,
) {
  const store = encryptedStoreFor(mutation.entityType);
  await db.transaction('rw', store, db.outbox, async () => {
    await store.put(entity);
    await db.outbox.add(mutation);
  });
}
export const pendingForEntity = (entityId: string) =>
  db.outbox.where('entityId').equals(entityId).sortBy('createdAt');
export async function durableBacklogSnapshot(now = Date.now()) {
  const [depth, oldest] = await Promise.all([
    db.outbox.count(),
    db.outbox.orderBy('createdAt').first(),
  ]);
  return buildBacklogSnapshot(depth, oldest?.createdAt, now);
}
export function buildBacklogSnapshot(
  depth: number,
  oldestCreatedAt: string | undefined,
  now = Date.now(),
) {
  if (!depth || !oldestCreatedAt) return undefined;
  return {
    depth,
    oldestAgeSeconds: Math.max(
      0,
      Math.min(31_536_000, Math.floor((now - Date.parse(oldestCreatedAt)) / 1_000)),
    ),
  };
}
export async function commitPull(
  records: EncryptedTaskRecord[],
  tombstones: string[],
  conflicts: EncryptedEntityRecord[],
  cursor: VectorCursor,
) {
  await db.transaction('rw', db.secureTasks, db.secureConflicts, db.settings, async () => {
    if (records.length) await db.secureTasks.bulkPut(records);
    if (tombstones.length) await db.secureTasks.bulkDelete(tombstones);
    if (conflicts.length) await db.secureConflicts.bulkPut(conflicts);
    await db.settings.put({ key: 'sync-cursor', value: JSON.stringify(cursor) });
  });
}
export function mergeCursor(current: VectorCursor, next: VectorCursor): VectorCursor {
  const merged = { ...current };
  for (const [key, value] of Object.entries(next)) merged[key] = Math.max(merged[key] ?? 0, value);
  return merged;
}
export interface EncryptedPullChange {
  entityType:
    | 'list'
    | 'category'
    | 'listItem'
    | 'directoryItem'
    | 'attachment'
    | 'copyJob'
    | 'accessControl'
    | 'project'
    | 'completionEvent'
    | 'deletionJob';
  record?: EncryptedEntityRecord;
  entityId: string;
  operation: 'upsert' | 'tombstone';
}
export interface GroupRevocationPurge {
  groupId: string;
  listIds: string[];
}
export async function commitEnhancedPull(
  changes: EncryptedPullChange[],
  conflicts: EncryptedEntityRecord[],
  cursor: VectorCursor,
  revocations: GroupRevocationPurge[] = [],
) {
  await db.transaction(
    'rw',
    [
      db.secureLists,
      db.secureCategories,
      db.secureListItems,
      db.secureDirectoryItems,
      db.secureAttachments,
      db.secureJobs,
      db.secureProjects,
      db.secureCompletionEvents,
      db.secureDeletionJobs,
      db.secureGroups,
      db.secureConflicts,
      db.outbox,
      db.settings,
    ],
    async () => {
      for (const revocation of revocations) {
        const childIds = (await db.secureListItems.toArray())
          .filter((item) => item.taskId && revocation.listIds.includes(item.taskId))
          .map((item) => item.id);
        await db.secureLists.bulkDelete(revocation.listIds);
        await db.secureListItems.bulkDelete(childIds);
        if (childIds.length) await db.secureAttachments.where('taskId').anyOf(childIds).delete();
        const affected = [...revocation.listIds, ...childIds];
        if (affected.length) {
          const pending = await db.outbox.where('entityId').anyOf(affected).toArray();
          for (const mutation of pending) {
            await db.secureConflicts.put({
              id: mutation.id,
              updatedAt: new Date().toISOString(),
              value: mutation.payload,
            });
            await db.outbox.delete(mutation.id);
          }
        }
        await db.settings.delete(`search-capability:group:${revocation.groupId}`);
        for (const id of revocation.listIds) await db.settings.delete(`search-document:list:${id}`);
        for (const id of childIds) await db.settings.delete(`search-document:listItem:${id}`);
      }
      for (const change of changes) {
        const store = encryptedStoreFor(change.entityType);
        if (change.operation === 'tombstone') await store.delete(change.entityId);
        else if (change.record) await store.put(change.record);
      }
      if (conflicts.length) await db.secureConflicts.bulkPut(conflicts);
      await db.settings.put({ key: 'sync-cursor', value: JSON.stringify(cursor) });
    },
  );
}
export function groupSequentialMutations<T extends { entityId: string; createdAt: string }>(
  mutations: T[],
): T[][] {
  const groups = new Map<string, T[]>();
  for (const mutation of [...mutations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const group = groups.get(mutation.entityId) ?? [];
    group.push(mutation);
    groups.set(mutation.entityId, group);
  }
  return [...groups.values()];
}
