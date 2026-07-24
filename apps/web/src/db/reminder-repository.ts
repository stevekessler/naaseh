import type { CategoryRecord, Reminder, TaskRevision } from '@naaseh/domain';
import { db, type EncryptedEntityRecord } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

async function secureRecord(
  namespace: string,
  value: { id: string },
  indexes: Partial<EncryptedEntityRecord> = {},
): Promise<EncryptedEntityRecord> {
  return { id: value.id, ...indexes, value: await encryptLocalValue(namespace, value.id, value) };
}

export async function saveCategory(category: CategoryRecord) {
  await db.secureCategories.put(
    await secureRecord('category', category, { updatedAt: String(category.version) }),
  );
}
export async function listCategories() {
  return Promise.all(
    (await db.secureCategories.toArray()).map((item) =>
      decryptLocalValue<CategoryRecord>('category', item.id, item.value),
    ),
  );
}
export async function saveReminder(reminder: Reminder) {
  await db.secureReminders.put(
    await secureRecord('reminder', reminder, {
      taskId: reminder.taskId,
      updatedAt: reminder.dueAt,
    }),
  );
}
export async function listReminders(taskId?: string) {
  const records = taskId
    ? await db.secureReminders.where('taskId').equals(taskId).toArray()
    : await db.secureReminders.toArray();
  return Promise.all(
    records.map((item) => decryptLocalValue<Reminder>('reminder', item.id, item.value)),
  );
}
export async function listRevisions(taskId: string) {
  const records = await db.secureRevisions.where('taskId').equals(taskId).sortBy('updatedAt');
  return Promise.all(
    records.map((item) => decryptLocalValue<TaskRevision>('revision', item.id, item.value)),
  );
}
