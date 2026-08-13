import type { EntityType, StackConflictReason, Task, VectorCursor } from '@naaseh/domain';
import {
  attachmentSchema,
  copyJobSchema,
  completionEventSchema,
  deletionJobSchema,
  directoryItemSchema,
  isSupportedEntityType,
  listItemSchema,
  listSchema,
  projectSchema,
  categorySchema,
  nextRetryDelay,
  personalStackOperationSchema,
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
import { refreshGoogleSyncCache } from '../features/google-sync/google-sync-client.js';
import {
  acknowledgeLocalStackOperation,
  applyOwnerStackChange,
  conflictLocalStackOperation,
  localStackScopeKey,
  readLocalStack,
  reorderLocalStack,
  type LocalStackMove,
  type LocalStackScope,
} from '../db/personal-stack-repository.js';
export type SyncState = 'offline' | 'idle' | 'syncing' | 'error';
type MutationResult = {
  mutationId: string;
  status: 'applied' | 'duplicate' | 'alreadyApplied' | 'conflict' | 'rejected' | 'retry';
  operationId?: string;
  version?: number;
  reason?: StackConflictReason;
  currentVersion?: number;
  problem?: { reason?: StackConflictReason; currentVersion?: number };
  current?: Task;
};

const serializedScopes = new Map<string, Promise<void>>();

async function serializeScope<T>(scopeKey: string, action: () => Promise<T>): Promise<T> {
  const previous = serializedScopes.get(scopeKey) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(action);
  const settled = result.then(
    () => undefined,
    () => undefined,
  );
  serializedScopes.set(scopeKey, settled);
  try {
    return await result;
  } finally {
    if (serializedScopes.get(scopeKey) === settled) serializedScopes.delete(scopeKey);
  }
}

export async function queuePersonalStackReorder(input: {
  ownerId: string;
  scope: LocalStackScope;
  move: LocalStackMove;
  baseVersion?: number;
  sourceClientId?: string;
}) {
  const scopeKey = localStackScopeKey(input.ownerId, input.scope);
  return serializeScope(scopeKey, async () => {
    const current = await readLocalStack(input.ownerId, input.scope);
    if (!current) throw new Error('Personal stack is unavailable.');
    return reorderLocalStack({
      ownerId: input.ownerId,
      scope: input.scope,
      baseVersion: input.baseVersion ?? current.version,
      sourceClientId: input.sourceClientId ?? (await getClientId()),
      move: input.move,
    });
  });
}

export const queueStackReorder = queuePersonalStackReorder;
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

export function shouldBootstrapTaskSnapshot(
  taskCount: number,
  pendingCount: number,
  cursor: VectorCursor,
) {
  return (
    taskCount === 0 &&
    pendingCount === 0 &&
    Object.values(cursor).some((sequence) => Number.isSafeInteger(sequence) && sequence > 0)
  );
}

async function recoverMissingTaskSnapshot(): Promise<void> {
  const [taskCount, pendingCount, cursor] = await Promise.all([
    db.secureTasks.count(),
    db.outbox.count(),
    readCursor(),
  ]);
  if (!shouldBootstrapTaskSnapshot(taskCount, pendingCount, cursor)) return;

  const response = await fetch('/api/v1/sync/bootstrap', {
    credentials: 'include',
  });
  if (!response.ok) throw syncHttpError('Synchronization bootstrap', response.status);
  const body = (await response.json()) as { tasks?: unknown[] };
  const records = await Promise.all(
    (body.tasks ?? []).map((task) => taskToEncryptedRecord(taskSchema.parse(task))),
  );
  await db.transaction('rw', db.secureTasks, db.outbox, async () => {
    // A task created while bootstrap was in flight wins. Never replace or
    // discard a local snapshot or pending mutation during recovery.
    if ((await db.secureTasks.count()) || (await db.outbox.count())) return;
    if (records.length) await db.secureTasks.bulkPut(records);
  });
}
async function pushMutation(
  csrfToken: string,
  mutation: Awaited<ReturnType<typeof decryptMutation>>,
  backlog: { depth: number; oldestAgeSeconds: number } | undefined,
) {
  const clientId = await getClientId();
  const isStackMutation = mutation.entityType === ('personalStackOperation' as string);
  const wireMutation = {
    id: mutation.id,
    entityId: mutation.entityId,
    entityType: mutation.entityType,
    operation: mutation.operation,
    baseVersion: mutation.baseVersion,
    payload: mutation.payload,
    createdAt: mutation.createdAt,
    attempts: mutation.attempts,
  };
  const response = await fetch('/api/v1/sync/push', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'content-type': 'application/json',
      'x-csrf-token': csrfToken,
      'x-client-id': clientId,
    },
    body: JSON.stringify({
      contractVersion: ['project', 'completionEvent', 'deletionJob'].includes(mutation.entityType)
        ? 3
        : isStackMutation
          ? 4
          : ['task', 'category', 'group'].includes(mutation.entityType)
            ? 1
            : 2,
      mutations: [wireMutation],
      ...(isStackMutation ? {} : { backlog }),
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
      const isStackMutation = (item.entityType as string) === 'personalStackOperation';
      if (['applied', 'duplicate', 'alreadyApplied'].includes(result.status)) {
        if (isStackMutation) {
          await acknowledgeLocalStackOperation({
            mutationId: item.id,
            status: result.status as 'applied' | 'alreadyApplied' | 'duplicate',
            ...(result.operationId ? { operationId: result.operationId } : {}),
            ...(result.version === undefined ? {} : { version: result.version }),
          });
        } else {
          await markRevisionSynced(item.id, result.status === 'applied' ? 'applied' : 'replayed');
          await db.outbox.delete(item.id);
        }
        continue;
      }
      if (result.status === 'conflict') {
        if (isStackMutation) {
          await conflictLocalStackOperation({
            mutationId: item.id,
            reason: result.reason ?? result.problem?.reason ?? 'version_mismatch',
            currentVersion:
              result.currentVersion ??
              result.problem?.currentVersion ??
              result.version ??
              item.baseVersion,
          });
        } else {
          const value = await encryptLocalValue('conflict', item.id, { mutation, result });
          await db.transaction('rw', db.secureConflicts, db.outbox, async () => {
            await db.secureConflicts.put({
              id: item.id,
              updatedAt: new Date().toISOString(),
              value,
            });
            await db.outbox.delete(item.id);
          });
        }
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
    body: JSON.stringify({ contractVersion: 4, cursor: current }),
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
    project: projectSchema,
    category: categorySchema,
    completionEvent: completionEventSchema,
    deletionJob: deletionJobSchema,
  };
  for (const change of body.changes) {
    const entityType = change.entityType ?? 'task';
    if (entityType === 'personalStackOperation') {
      if (change.operation !== 'upsert') {
        throw new Error('Personal stack operations cannot be tombstoned.');
      }
      const operation = personalStackOperationSchema.parse(change.payload);
      if (operation.id !== change.entityId) {
        throw new Error('Personal stack operation feed identity does not match its envelope.');
      }
      const scope: LocalStackScope =
        operation.scopeType === 'project'
          ? { scopeType: 'project', scopeId: operation.scopeId! }
          : { scopeType: 'overall' };
      const commonChange = {
        id: operation.id,
        mutationId: operation.mutationId,
        userId: operation.userId,
        scopeType: operation.scopeType,
        ...(operation.scopeId ? { scopeId: operation.scopeId } : {}),
        baseVersion: operation.baseVersion,
        version: operation.version,
        sourceClientId: operation.sourceClientId,
        acceptedAt: operation.acceptedAt,
      };
      const ownerChange =
        operation.kind === 'filtered_permutation'
          ? {
              ...commonChange,
              kind: operation.kind,
              movedWork: operation.movedWork,
              destinationIndex: operation.destinationIndex,
              affectedWork: operation.affectedWork,
              filterBasis: operation.filterBasis,
            }
          : {
              ...commonChange,
              kind: operation.kind,
              movedWork: operation.movedWork,
              ...(operation.beforeWork ? { beforeWork: operation.beforeWork } : {}),
              ...(operation.afterWork ? { afterWork: operation.afterWork } : {}),
            };
      await serializeScope(localStackScopeKey(operation.userId, scope), () =>
        applyOwnerStackChange(ownerChange),
      );
      continue;
    }
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
            | 'category'
            | 'listItem'
            | 'directoryItem'
            | 'attachment'
            | 'copyJob'
            | 'accessControl'
            | 'project'
            | 'completionEvent'
            | 'deletionJob',
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
        projectId?: string;
        categoryId?: string;
        lifecycle?: string;
        completedBy?: string;
        occurredAt?: string;
        reversedAt?: string;
      };
      enhanced.push({
        entityType: entityType as
          | 'list'
          | 'category'
          | 'listItem'
          | 'directoryItem'
          | 'attachment'
          | 'copyJob'
          | 'accessControl'
          | 'project'
          | 'completionEvent'
          | 'deletionJob',
        entityId: change.entityId,
        operation: 'upsert' as const,
        record: {
          id: parsed.id,
          ...((parsed.listId ?? parsed.parentId)
            ? { taskId: parsed.listId ?? parsed.parentId }
            : {}),
          updatedAt: parsed.updatedAt ?? change.changedAt ?? new Date().toISOString(),
          ...('projectId' in parsed && typeof parsed.projectId === 'string'
            ? { projectId: parsed.projectId }
            : {}),
          ...('categoryId' in parsed && typeof parsed.categoryId === 'string'
            ? { categoryId: parsed.categoryId }
            : {}),
          ...('lifecycle' in parsed && typeof parsed.lifecycle === 'string'
            ? { lifecycle: parsed.lifecycle }
            : {}),
          ...('completedBy' in parsed && typeof parsed.completedBy === 'string'
            ? { completedBy: parsed.completedBy }
            : {}),
          ...('occurredAt' in parsed && typeof parsed.occurredAt === 'string'
            ? { occurredAt: parsed.occurredAt }
            : {}),
          ...('reversedAt' in parsed && typeof parsed.reversedAt === 'string'
            ? { reversedAt: parsed.reversedAt }
            : {}),
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
async function performSync(csrfToken: string) {
  await recoverMissingTaskSnapshot();
  await drainOutbox(csrfToken);
  await pullChanges();
  await refreshGoogleSyncCache(csrfToken).catch(() => undefined);
}

export async function syncNow(csrfToken: string) {
  if (!navigator.locks) return performSync(csrfToken);
  await navigator.locks.request('naaseh-sync', { ifAvailable: true }, async (lock) => {
    if (lock) await performSync(csrfToken);
  });
}
export async function drainSequentially(
  csrfToken: string,
  onRetry: (delay: number) => void = () => {},
): Promise<void> {
  try {
    await syncNow(csrfToken);
  } catch (error) {
    const item = await db.outbox.orderBy('createdAt').first();
    if (item) {
      const delay = nextRetryDelay(item.attempts);
      await db.outbox.update(item.id, { attempts: item.attempts + 1 });
      onRetry(delay);
    }
    throw error instanceof Error ? error : new Error('Pending changes remain safely stored.');
  }
}
export async function listConflicts() {
  const records = await db.secureConflicts.toArray();
  return Promise.all(records.map((item) => decryptLocalValue('conflict', item.id, item.value)));
}
