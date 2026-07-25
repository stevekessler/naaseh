import { db } from './database.js';

export async function purgeConfirmedDeletion(
  resourceType: 'task' | 'list' | 'category' | 'project',
  resourceId: string,
) {
  if (resourceType === 'category' || resourceType === 'project') {
    await db.transaction(
      'rw',
      db.secureCategories,
      db.secureProjects,
      db.outbox,
      db.secureConflicts,
      async () => {
        if (resourceType === 'category') await db.secureCategories.delete(resourceId);
        else await db.secureProjects.delete(resourceId);
        await db.outbox.where('entityId').equals(resourceId).delete();
        await db.secureConflicts.where('id').equals(resourceId).delete();
      },
    );
    return;
  }
  const childIds =
    resourceType === 'list'
      ? (await db.secureListItems.where('taskId').equals(resourceId).toArray()).map(
          (item) => item.id,
        )
      : [];
  const ids = [resourceId, ...childIds];
  await db.transaction(
    'rw',
    [
      db.secureTasks,
      db.secureLists,
      db.secureListItems,
      db.secureRevisions,
      db.secureCompletionEvents,
      db.secureAttachments,
      db.secureConflicts,
      db.outbox,
      db.settings,
    ],
    async () => {
      if (resourceType === 'task') await db.secureTasks.delete(resourceId);
      else {
        await db.secureLists.delete(resourceId);
        await db.secureListItems.bulkDelete(childIds);
      }
      await db.secureRevisions.where('taskId').anyOf(ids).delete();
      await db.secureCompletionEvents.where('taskId').anyOf(ids).delete();
      await db.secureAttachments.where('taskId').anyOf(ids).delete();
      const conflictIds = (await db.secureConflicts.toArray())
        .filter((conflict) => ids.includes(conflict.taskId ?? conflict.id))
        .map((conflict) => conflict.id);
      await db.secureConflicts.bulkDelete(conflictIds);
      await db.outbox.where('entityId').anyOf(ids).delete();
      for (const id of ids) {
        await db.settings.delete(`search-document:${resourceType}:${id}`);
        await db.settings.delete(`deletion-preview:${resourceType}:${id}`);
      }
    },
  );
}
