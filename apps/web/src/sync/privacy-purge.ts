import { db } from '../db/database.js';
import {
  purgeLocalPersonalStack,
  removeLocalStackMembership,
} from '../db/personal-stack-repository.js';
import { purgeLocalTaskTimer } from '../db/task-timer-repository.js';

export const purgePrivateStackStateForSession = purgeLocalPersonalStack;

export async function purgeRevokedOrDeletedStackWork(
  ownerId: string,
  entityType: 'task' | 'list' | 'listItem',
  entityId: string,
) {
  if (entityType === 'listItem') return;
  await removeLocalStackMembership(ownerId, entityType, entityId);
  if (entityType === 'task') await purgeLocalTaskTimer(ownerId, entityId);
}
export async function purgeRevokedGroup(groupId: string, entityIds: string[]) {
  await db.transaction(
    'rw',
    [
      db.secureLists,
      db.secureListItems,
      db.secureAttachments,
      db.secureConflicts,
      db.outbox,
      db.settings,
    ],
    async () => {
      await db.secureLists.bulkDelete(entityIds);
      const childIds = (await db.secureListItems.toArray())
        .filter((item) => item.taskId && entityIds.includes(item.taskId))
        .map((item) => item.id);
      await db.secureListItems.bulkDelete(childIds);
      await db.secureAttachments.where('taskId').anyOf(childIds).delete();
      const pending = await db.outbox
        .where('entityId')
        .anyOf([...entityIds, ...childIds])
        .toArray();
      for (const mutation of pending) {
        await db.secureConflicts.put({
          id: mutation.id,
          updatedAt: new Date().toISOString(),
          value: mutation.payload,
        });
        await db.outbox.delete(mutation.id);
      }
      await db.settings.delete(`search-capability:group:${groupId}`);
      for (const id of entityIds) await db.settings.delete(`search-document:list:${id}`);
      for (const id of childIds) await db.settings.delete(`search-document:listItem:${id}`);
    },
  );
}
export async function purgeEntityBeforeCursor(
  entityType: 'task' | 'list' | 'listItem',
  entityId: string,
) {
  const store =
    entityType === 'task'
      ? db.secureTasks
      : entityType === 'list'
        ? db.secureLists
        : db.secureListItems;
  await db.transaction('rw', store, db.settings, async () => {
    await store.delete(entityId);
    await db.settings.delete(`search-document:${entityType}:${entityId}`);
  });
}

export async function purgeRevokedSessionData(options: {
  transaction: (work: () => Promise<void>) => Promise<unknown>;
  clearProtectedStores: () => Promise<void>;
  clearDependentOutbox: () => Promise<void>;
}) {
  await options.transaction(async () => {
    await options.clearProtectedStores();
    await options.clearDependentOutbox();
  });
}

/** Removes all account-derived browser data in one Dexie transaction after revocation. */
export async function purgeAllAuthorizedData() {
  const protectedTables = db.tables;
  await db.transaction('rw', protectedTables, async () => {
    for (const table of protectedTables) await table.clear();
  });
}
