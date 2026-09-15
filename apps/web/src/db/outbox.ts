import type { VectorCursor } from '@naaseh/domain';
import type { StoredMutation, EncryptedTaskRecord, EncryptedEntityRecord } from './database.js';
import { db } from './database.js';
import { assertNoExtraLowActiveValues } from './extra-low-removal.js';
export async function atomicEntityAndMutation(
  entity: EncryptedTaskRecord,
  mutation: StoredMutation,
) {
  assertNoExtraLowActiveValues([entity]);
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
    case 'taskTimer':
      return db.secureTaskTimers;
    default:
      throw new Error(`Entity type ${entityType} does not use the generic encrypted store`);
  }
};

export async function atomicEncryptedEntityAndMutation(
  entity: EncryptedEntityRecord,
  mutation: StoredMutation,
) {
  assertNoExtraLowActiveValues([entity]);
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
// Advance normal downloads even when a pending edit protects a local record.
// Retain a replay cursor so skipped server changes are revisited after it resolves.
async function commitPullCursor(cursor: VectorCursor) {
  const current = await db.settings.get('sync-cursor');
  const highWater: VectorCursor = current ? JSON.parse(current.value) : {};
  const replay = await db.settings.get('pending-sync-replay-cursor');
  if (await db.outbox.count()) {
    if (!replay)
      await db.settings.put({
        key: 'pending-sync-replay-cursor',
        value: JSON.stringify(highWater),
      });
  } else if (replay) {
    if (Object.entries(highWater).every(([feed, sequence]) => (cursor[feed] ?? 0) >= sequence)) {
      await db.settings.delete('pending-sync-replay-cursor');
    } else {
      await db.settings.put({ key: 'pending-sync-replay-cursor', value: JSON.stringify(cursor) });
    }
  }
  await db.settings.put({
    key: 'sync-cursor',
    value: JSON.stringify(mergeCursor(highWater, cursor)),
  });
}

export async function commitPull(
  records: EncryptedTaskRecord[],
  tombstones: string[],
  conflicts: EncryptedEntityRecord[],
  cursor: VectorCursor,
  unreadable: EncryptedTaskRecord[] = [],
) {
  await db.transaction(
    'rw',
    db.secureTasks,
    db.secureConflicts,
    db.settings,
    db.outbox,
    async () => {
      const pending = await db.outbox.toArray();
      const protectedIds = new Set(
        pending.filter((item) => item.entityType === 'task').map((item) => item.entityId),
      );
      const applicable = records.filter((record) => !protectedIds.has(record.id));
      for (const record of applicable) {
        const broken = unreadable.find((item) => item.id === record.id);
        if (!broken) continue;
        const existing = await db.secureTasks.get(record.id);
        if (
          existing?.value.ciphertext === broken.value.ciphertext &&
          existing.value.iv === broken.value.iv
        ) {
          await db.settings.put({
            key: `task-recovery:${existing.id}:${existing.value.iv}`,
            value: JSON.stringify(existing),
          });
        }
      }
      if (applicable.length) await db.secureTasks.bulkPut(applicable);
      if (tombstones.length) await db.secureTasks.bulkDelete(tombstones);
      if (conflicts.length) await db.secureConflicts.bulkPut(conflicts);
      await commitPullCursor(cursor);
    },
  );
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
    | 'deletionJob'
    | 'taskTimer';
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
      db.secureTaskTimers,
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
      const pending = await db.outbox.toArray();
      for (const change of changes) {
        if (
          change.operation === 'upsert' &&
          pending.some(
            (item) => item.entityType === change.entityType && item.entityId === change.entityId,
          )
        )
          continue;
        const store = encryptedStoreFor(change.entityType);
        if (change.operation === 'tombstone') await store.delete(change.entityId);
        else if (change.record) await store.put(change.record);
      }
      if (conflicts.length) await db.secureConflicts.bulkPut(conflicts);
      await commitPullCursor(cursor);
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
