import { db } from '../../db/database.js';
import { decryptLocalValue } from '../../db/task-repository.js';
import type { Task } from '@naaseh/domain';

const historyKey = 'sync-history-v1';
const observedPendingKey = 'sync-history-observed-pending-v1';
export const syncHistoryRetentionMs = 7 * 24 * 60 * 60 * 1_000;
const maximumHistoryEntries = 500;

export type SyncArea = 'tasks and lists' | 'journal' | 'crisis plans';
export type SyncHistoryStatus = 'queued' | 'synced' | 'needs attention';

export interface PendingSyncItem {
  key: string;
  id: string;
  entityId: string;
  area: SyncArea;
  entityType: string;
  queuedAt: string;
  attempts: number;
  title?: string;
}

export interface SyncHistoryEntry extends PendingSyncItem {
  eventId: string;
  status: SyncHistoryStatus;
  occurredAt: string;
}

async function withoutPrivateTaskTitles<T extends PendingSyncItem>(items: readonly T[]) {
  const taskEntityIds = [
    ...new Set(
      items
        .filter((item) => item.entityType === 'task')
        .map((item) => item.entityId)
        .filter(Boolean),
    ),
  ];
  const taskRecords = await db.secureTasks.bulkGet(taskEntityIds);
  const privateTaskIds = new Set(
    taskRecords.filter((record) => record?.visibility === 'private').map((record) => record!.id),
  );
  return items.map((item) => {
    if (!privateTaskIds.has(item.entityId) || !item.title) return item;
    const safe = { ...item };
    delete safe.title;
    return safe;
  });
}

function parseStoredArray<T>(value: string | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function listPendingSyncItems(): Promise<PendingSyncItem[]> {
  const [ordinary, journal, crisis] = await Promise.all([
    db.outbox.toArray(),
    db.secureJournalOutbox.toArray(),
    db.secureCrisisPlanOutbox.toArray(),
  ]);
  const publicTaskTitles = new Map<string, string>();
  const taskIds = [
    ...new Set(
      ordinary.filter(({ entityType }) => entityType === 'task').map(({ entityId }) => entityId),
    ),
  ];
  const taskRecords = await db.secureTasks.bulkGet(taskIds);
  await Promise.all(
    taskRecords.map(async (record) => {
      if (!record || record.visibility === 'private') return;
      try {
        const task = await decryptLocalValue<Task>('task', record.id, record.value);
        if (task.visibility !== 'private') publicTaskTitles.set(record.id, task.label);
      } catch {
        // The queue remains usable even when a local title cannot be decrypted.
      }
    }),
  );
  return [
    ...ordinary.map((item) => {
      const title = publicTaskTitles.get(item.entityId);
      return {
        key: `ordinary:${item.id}`,
        id: item.id,
        entityId: item.entityId,
        area: 'tasks and lists' as const,
        entityType: String(item.entityType),
        queuedAt: item.createdAt,
        attempts: item.attempts,
        ...(title ? { title } : {}),
      };
    }),
    ...journal.map((item) => ({
      key: `journal:${item.id}`,
      id: item.id,
      entityId: item.id,
      area: 'journal' as const,
      entityType: item.entityType,
      queuedAt: item.updatedAt,
      attempts: 0,
    })),
    ...crisis.map((item) => ({
      key: `crisis:${item.id}`,
      id: item.id,
      entityId: item.id,
      area: 'crisis plans' as const,
      entityType: item.entityType,
      queuedAt: item.updatedAt,
      attempts: 0,
    })),
  ].sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

export async function listSyncHistory(now = Date.now()): Promise<SyncHistoryEntry[]> {
  const stored = await db.settings.get(historyKey);
  const cutoff = now - syncHistoryRetentionMs;
  const history = parseStoredArray<SyncHistoryEntry>(stored?.value)
    .filter((entry) => Date.parse(entry.occurredAt) >= cutoff)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return withoutPrivateTaskTitles(history);
}

function historyEntry(
  item: PendingSyncItem,
  status: SyncHistoryStatus,
  occurredAt: string,
): SyncHistoryEntry {
  return {
    ...item,
    eventId: `${status}:${item.key}`,
    status,
    occurredAt,
  };
}

export async function reconcileSyncHistory(current: readonly PendingSyncItem[], now = new Date()) {
  const [observedSetting, historySetting, conflicts, stackConflicts, journalConflicts] =
    await Promise.all([
      db.settings.get(observedPendingKey),
      db.settings.get(historyKey),
      db.secureConflicts.toArray(),
      db.secureStackConflicts.toArray(),
      db.secureJournalConflicts.toArray(),
    ]);
  const storedHistory = parseStoredArray<SyncHistoryEntry>(historySetting?.value);
  const observed = parseStoredArray<PendingSyncItem>(observedSetting?.value);
  const taskEntityIds = [
    ...new Set(
      [...current, ...observed, ...storedHistory]
        .filter((item) => item.entityType === 'task')
        .map((item) => item.entityId)
        .filter(Boolean),
    ),
  ];
  const taskRecords = await db.secureTasks.bulkGet(taskEntityIds);
  const privateTaskIds = new Set(
    taskRecords.filter((record) => record?.visibility === 'private').map((record) => record!.id),
  );
  const hidePrivateTitle = <T extends PendingSyncItem>(item: T): T => {
    if (!privateTaskIds.has(item.entityId) || !item.title) return item;
    const safe = { ...item };
    delete safe.title;
    return safe;
  };
  const safeCurrent = current.map(hidePrivateTitle);
  const safeObserved = observed.map(hidePrivateTitle);
  const safeStoredHistory = storedHistory.map(hidePrivateTitle);
  const previousByKey = new Map(safeObserved.map((item) => [item.key, item]));
  const currentByKey = new Map(safeCurrent.map((item) => [item.key, item]));
  const attentionIds = new Set([
    ...conflicts.map((item) => item.id),
    ...stackConflicts.flatMap((item) => [item.id, item.mutationId].filter(Boolean) as string[]),
    ...journalConflicts.flatMap((item) => [item.id, item.mutationId].filter(Boolean) as string[]),
  ]);
  const occurredAt = now.toISOString();
  const additions: SyncHistoryEntry[] = [];
  for (const item of safeCurrent) {
    if (!previousByKey.has(item.key)) additions.push(historyEntry(item, 'queued', item.queuedAt));
  }
  for (const item of safeObserved) {
    if (currentByKey.has(item.key)) continue;
    additions.push(
      historyEntry(item, attentionIds.has(item.id) ? 'needs attention' : 'synced', occurredAt),
    );
  }
  const cutoff = now.getTime() - syncHistoryRetentionMs;
  const history = [...additions, ...safeStoredHistory]
    .filter((entry) => Date.parse(entry.occurredAt) >= cutoff)
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.eventId === entry.eventId) === index,
    )
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
    .slice(0, maximumHistoryEntries);
  await db.transaction('rw', db.settings, async () => {
    await db.settings.put({ key: observedPendingKey, value: JSON.stringify(safeCurrent) });
    await db.settings.put({ key: historyKey, value: JSON.stringify(history) });
  });
}
