import { completionEventSchema, type CompletionEvent } from '@naaseh/domain';
import { db } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

const toRecord = async (event: CompletionEvent) => ({
  id: event.id,
  taskId: event.taskId,
  completedBy: event.completedBy,
  occurredAt: event.occurredAt,
  ...(event.projectIdAtCompletion ? { projectId: event.projectIdAtCompletion } : {}),
  ...(event.categoryIdAtCompletion ? { categoryId: event.categoryIdAtCompletion } : {}),
  ...(event.reversedAt ? { reversedAt: event.reversedAt } : {}),
  updatedAt: event.reversedAt ?? event.occurredAt,
  value: await encryptLocalValue('completionEvent', event.id, event),
});

export async function putLocalCompletionEvent(event: CompletionEvent) {
  await db.secureCompletionEvents.put(await toRecord(completionEventSchema.parse(event)));
}

export async function listLocalCompletionEvents(completedBy?: string) {
  const records = completedBy
    ? await db.secureCompletionEvents.where('completedBy').equals(completedBy).toArray()
    : await db.secureCompletionEvents.toArray();
  return Promise.all(
    records.map(async (record) =>
      completionEventSchema.parse(
        await decryptLocalValue<CompletionEvent>('completionEvent', record.id, record.value),
      ),
    ),
  );
}

export async function listCountedLocalCompletionEvents(completedBy: string) {
  return (await listLocalCompletionEvents(completedBy)).filter((event) => event.counted);
}

export async function purgeLocalCompletionEventsForTask(taskId: string) {
  await db.secureCompletionEvents.where('taskId').equals(taskId).delete();
}
