import { completionEventSchema, type CompletionEvent } from '@naaseh/domain';
import { db } from './database.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

const toRecord = async (event: CompletionEvent) => ({
  id: event.id,
  taskId: event.taskId,
  completedBy: event.completedBy,
  occurredAt: event.occurredAt,
  urgencyAtCompletion: event.urgencyAtCompletion,
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

export interface CompletionReportFreshness {
  source: 'cache';
  lastSyncedAt?: string;
  stale: boolean;
  pendingUrgencyChanges: number;
}

const freshnessKey = (completedBy: string) => `completion-report-freshness:${completedBy}`;

export async function saveLocalCompletionReportFreshness(
  completedBy: string,
  state: Omit<CompletionReportFreshness, 'source'>,
) {
  await db.settings.put({ key: freshnessKey(completedBy), value: JSON.stringify(state) });
}

export async function readLocalCompletionReport(completedBy: string) {
  const [events, stored] = await Promise.all([
    listCountedLocalCompletionEvents(completedBy),
    db.settings.get(freshnessKey(completedBy)),
  ]);
  let freshness: Omit<CompletionReportFreshness, 'source'> = {
    stale: true,
    pendingUrgencyChanges: 0,
  };
  if (stored?.value) {
    try {
      const candidate = JSON.parse(stored.value) as Partial<CompletionReportFreshness>;
      freshness = {
        ...(typeof candidate.lastSyncedAt === 'string'
          ? { lastSyncedAt: candidate.lastSyncedAt }
          : {}),
        stale: candidate.stale !== false,
        pendingUrgencyChanges:
          typeof candidate.pendingUrgencyChanges === 'number'
            ? Math.max(0, Math.floor(candidate.pendingUrgencyChanges))
            : 0,
      };
    } catch {
      // Treat malformed cache metadata as stale without discarding encrypted report rows.
    }
  }
  return { events, state: { source: 'cache' as const, ...freshness } };
}

export async function purgeLocalCompletionEventsForTask(taskId: string) {
  await db.secureCompletionEvents.where('taskId').equals(taskId).delete();
}
