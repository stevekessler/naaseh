import type { EntityType, Task, VectorCursor } from '@naaseh/domain';
import {
  attachmentSchema,
  copyJobSchema,
  directoryItemSchema,
  isSupportedEntityType,
  listItemSchema,
  listSchema,
  nextRetryDelay,
  taskSchema,
} from '@naaseh/domain';
import { db } from '../db/database.js';
import {
  commitPull,
  commitEnhancedPull,
  durableBacklogSnapshot,
  groupSequentialMutations,
  mergeCursor,
} from '../db/outbox.js';
import { readCursor } from '../db/sync-cursor.js';
import {
  decryptLocalValue,
  decryptMutation,
  encryptLocalValue,
  taskToEncryptedRecord,
  markRevisionSynced,
} from '../db/task-repository.js';
import { getClientId } from '../db/client-id.js';
import { listLocalLists } from '../db/list-repository.js';
export type SyncState = 'offline' | 'idle' | 'syncing' | 'error';
type MutationResult = {
  mutationId: string;
  status: 'applied' | 'duplicate' | 'alreadyApplied' | 'conflict' | 'rejected' | 'retry';
  current?: Task;
};
export function classifyMutationResults(results: MutationResult[]) {
  return {
    completed: results
      .filter((item) => ['applied', 'duplicate', 'alreadyApplied'].includes(item.status))
      .map((item) => item.mutationId),
    conflicts: results.filter((item) => item.status === 'conflict').map((item) => item.mutationId),
    remaining: results
      .filter((item) => item.status === 'rejected' || item.status === 'retry')
      .map((item) => item.mutationId),
  };
}
export const syncHttpError = (operation: string, status: number) =>
  new Error(`${operation} failed (${status}); pending changes remain safely stored.`);
async function pushMutation(
  csrfToken: string,
  mutation: Awaited<ReturnType<typeof decryptMutation>>,
  backlog: { depth: number; oldestAgeSeconds: number } | undefined,
) {
  const clientId = await getClientId();
  const response = await fetch('/api/v1/sync/push', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-client-id': clientId,
    },
    body: JSON.stringify({
      contractVersion: ['task', 'category', 'group'].includes(mutation.entityType) ? 1 : 2,
      mutations: [mutation],
      backlog,
    }),
  });
  if (!response.ok) throw syncHttpError('Synchronization push', response.status);
  const body = (await response.json()) as { results: MutationResult[] };
  return body.results[0];
}
export async function drainOutbox(csrfToken: string): Promise<void> {
  if (!navigator.onLine) return;
  const stored = await db.outbox.orderBy('createdAt').toArray();
  for (const queue of groupSequentialMutations(stored)) {
    for (const item of queue) {
      const mutation = await decryptMutation(item);
      const result = await pushMutation(csrfToken, mutation, await durableBacklogSnapshot());
      if (!result) throw new Error('Synchronization returned no mutation result.');
      if (['applied', 'duplicate', 'alreadyApplied'].includes(result.status)) {
        await markRevisionSynced(item.id, result.status === 'applied' ? 'applied' : 'replayed');
        await db.outbox.delete(item.id);
        continue;
      }
      if (result.status === 'conflict') {
        const value = await encryptLocalValue('conflict', item.id, { mutation, result });
        await db.transaction('rw', db.secureConflicts, db.outbox, async () => {
          await db.secureConflicts.put({ id: item.id, updatedAt: new Date().toISOString(), value });
          await db.outbox.delete(item.id);
        });
        continue;
      }
      if (result.status === 'rejected')
        throw new Error('A pending change was rejected and remains stored.');
      throw new Error('The server asked the browser to retry synchronization.');
    }
  }
}
export async function pullChanges(): Promise<void> {
  if (!navigator.onLine) return;
  const current = await readCursor();
  const response = await fetch('/api/v1/sync/pull', {
    method: 'POST',
    credentials: 'include',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contractVersion: 2, cursor: current }),
  });
  if (!response.ok) throw syncHttpError('Synchronization pull', response.status);
  const body = (await response.json()) as {
    changes: Array<{
      entityType?: string;
      entityId: string;
      operation: 'upsert' | 'tombstone';
      payload?: unknown;
      changedAt?: string;
    }>;
    cursor: VectorCursor;
  };
  const records = [];
  const tombstones = [];
  const enhanced = [];
  const revocations: { groupId: string; listIds: string[] }[] = [];
  const parsers: Partial<Record<EntityType, { parse(value: unknown): unknown }>> = {
    list: listSchema,
    listItem: listItemSchema,
    directoryItem: directoryItemSchema,
    attachment: attachmentSchema,
    copyJob: copyJobSchema,
  };
  for (const change of body.changes) {
    const entityType = change.entityType ?? 'task';
    if (!isSupportedEntityType(entityType))
      throw new Error(`Unsupported synchronized entity: ${entityType}`);
    if (entityType !== 'task') {
      if (change.operation === 'tombstone') {
        if (entityType === 'accessControl') {
          const revoked = (await listLocalLists())
            .filter((list) => list.groupId === change.entityId)
            .map((list) => list.id);
          revocations.push({ groupId: change.entityId, listIds: revoked });
        }
        enhanced.push({
          entityType: entityType as
            | 'list'
            | 'listItem'
            | 'directoryItem'
            | 'attachment'
            | 'copyJob'
            | 'accessControl',
          entityId: change.entityId,
          operation: 'tombstone' as const,
        });
        continue;
      }
      const parser = parsers[entityType];
      if (!parser) continue;
      const parsed = parser.parse(change.payload) as {
        id: string;
        updatedAt?: string;
        listId?: string;
        parentId?: string;
      };
      enhanced.push({
        entityType: entityType as
          | 'list'
          | 'listItem'
          | 'directoryItem'
          | 'attachment'
          | 'copyJob'
          | 'accessControl',
        entityId: change.entityId,
        operation: 'upsert' as const,
        record: {
          id: parsed.id,
          ...((parsed.listId ?? parsed.parentId)
            ? { taskId: parsed.listId ?? parsed.parentId }
            : {}),
          updatedAt: parsed.updatedAt ?? change.changedAt ?? new Date().toISOString(),
          value: await encryptLocalValue(entityType, parsed.id, parsed),
        },
      });
      continue;
    }
    if (change.operation === 'tombstone') {
      tombstones.push(change.entityId);
      continue;
    }
    records.push(await taskToEncryptedRecord(taskSchema.parse(change.payload)));
  }
  const cursor = mergeCursor(current, body.cursor);
  if (enhanced.length) await commitEnhancedPull(enhanced, [], cursor, revocations);
  if (records.length || tombstones.length || !enhanced.length)
    await commitPull(records, tombstones, [], cursor);
}
export async function syncNow(csrfToken: string) {
  await drainOutbox(csrfToken);
  await pullChanges();
}
export async function drainSequentially(
  csrfToken: string,
  onRetry: (delay: number) => void = () => {},
): Promise<void> {
  try {
    await syncNow(csrfToken);
  } catch (error) {
    const item = await db.outbox.orderBy('createdAt').first();
    const delay = nextRetryDelay(item?.attempts ?? 0);
    if (item) await db.outbox.update(item.id, { attempts: item.attempts + 1 });
    onRetry(delay);
    throw error instanceof Error ? error : new Error('Pending changes remain safely stored.');
  }
}
export async function listConflicts() {
  const records = await db.secureConflicts.toArray();
  return Promise.all(records.map((item) => decryptLocalValue('conflict', item.id, item.value)));
}
