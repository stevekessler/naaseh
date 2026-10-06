import {
  createUlid,
  listItemSchema,
  listSchema,
  taskSchema,
  type Mutation,
  type Task,
} from '@naaseh/domain';
import { db } from '../db/database.js';
import {
  decryptLocalValue,
  encryptLocalValue,
  taskToEncryptedRecord,
} from '../db/task-repository.js';

export interface ReviewConflict {
  id: string;
  createdAt?: string | undefined;
  mutation?: Mutation | undefined;
  reason: string;
  message?: string;
  code?: string;
  currentVersion?: number;
  display?: ConflictDisplayContext;
}

export interface ConflictDisplayContext {
  entityLabel: string;
  parentLabel?: string;
}

export const STALE_CONFLICT_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export function isStaleConflict(conflict: Pick<ReviewConflict, 'createdAt'>, now = Date.now()) {
  if (!conflict.createdAt) return false;
  const createdAt = Date.parse(conflict.createdAt);
  return Number.isFinite(createdAt) && now - createdAt >= STALE_CONFLICT_AGE_MS;
}

const isObsoleteConflict = (conflict: ReviewConflict) => conflict.reason === 'hard_deleted';

export async function readConflictDisplayContext(
  mutation?: Mutation,
): Promise<ConflictDisplayContext | undefined> {
  if (!mutation) return undefined;
  try {
    if (mutation.entityType === 'listItem') {
      const row = await db.secureListItems.get(mutation.entityId);
      const parsed = row
        ? listItemSchema.parse(await decryptLocalValue('listItem', mutation.entityId, row.value))
        : mutation.operation === 'create'
          ? listItemSchema.safeParse(mutation.payload).data
          : undefined;
      if (!parsed) return undefined;
      const parentRow = await db.secureLists.get(parsed.listId);
      const parent = parentRow
        ? listSchema.parse(await decryptLocalValue('list', parsed.listId, parentRow.value))
        : undefined;
      return {
        entityLabel: parsed.nameOverride ?? parsed.directorySnapshot.name,
        ...(parent ? { parentLabel: parent.name } : {}),
      };
    }
    if (mutation.entityType === 'list') {
      const row = await db.secureLists.get(mutation.entityId);
      const parsed = row
        ? listSchema.parse(await decryptLocalValue('list', mutation.entityId, row.value))
        : mutation.operation === 'create'
          ? listSchema.safeParse(mutation.payload).data
          : undefined;
      return parsed ? { entityLabel: parsed.name } : undefined;
    }
  } catch {
    // A missing or unreadable cache entry must not hide the conflict itself.
  }
  return undefined;
}

export async function listReviewConflicts(): Promise<ReviewConflict[]> {
  return Promise.all(
    (await db.secureConflicts.toArray()).map(async (record) => {
      try {
        const saved = await decryptLocalValue<{
          mutation?: Mutation;
          result?: {
            reason?: string;
            entityVersion?: number;
            currentVersion?: number;
            problem?: { reason?: string; message?: string; code?: string };
          };
          display?: ConflictDisplayContext;
        }>('conflict', record.id, record.value);
        const currentVersion = saved.result?.entityVersion ?? saved.result?.currentVersion;
        const display = saved.display ?? (await readConflictDisplayContext(saved.mutation));
        return {
          id: record.id,
          createdAt: record.updatedAt,
          mutation: saved.mutation,
          reason: saved.result?.reason ?? saved.result?.problem?.reason ?? 'version_mismatch',
          ...(saved.result?.problem?.message ? { message: saved.result.problem.message } : {}),
          ...(saved.result?.problem?.code ? { code: saved.result.problem.code } : {}),
          ...(currentVersion !== undefined ? { currentVersion } : {}),
          ...(display ? { display } : {}),
        };
      } catch {
        // Timer and legacy access-revocation records use other encryption namespaces.
        // Never expose the contents of a revoked resource by trying its mutation key.
        return {
          id: record.id,
          createdAt: record.updatedAt,
          reason: record.ownerId ? 'timer_changed' : 'unavailable',
        };
      }
    }),
  );
}

export async function dismissObsoleteConflicts(options?: {
  expiredOnly?: boolean;
  now?: number;
}): Promise<number> {
  const now = options?.now ?? Date.now();
  const targets = (await listReviewConflicts()).filter(
    (conflict) =>
      isObsoleteConflict(conflict) && (!options?.expiredOnly || isStaleConflict(conflict, now)),
  );
  if (!targets.length) return 0;
  let dismissed = 0;
  await db.transaction(
    'rw',
    [
      db.secureConflicts,
      db.secureTasks,
      db.secureLists,
      db.secureListItems,
      db.outbox,
      db.settings,
    ],
    async () => {
      for (const conflict of targets) {
        const mutation = conflict.mutation;
        if (mutation && (await db.outbox.where('entityId').equals(mutation.entityId).count()) > 0)
          continue;
        if (mutation?.entityType === 'task') await db.secureTasks.delete(mutation.entityId);
        if (mutation?.entityType === 'list') await db.secureLists.delete(mutation.entityId);
        if (mutation?.entityType === 'listItem') await db.secureListItems.delete(mutation.entityId);
        await db.secureConflicts.delete(conflict.id);
        dismissed += 1;
      }
      await db.settings.put({ key: 'pending-sync-replay-cursor', value: '{}' });
    },
  );
  return dismissed;
}

export async function readConflictTask(conflict: ReviewConflict): Promise<Task | null> {
  if (!navigator.onLine)
    throw new Error('Connect to review the current server version. Your saved change is safe.');
  const response = await fetch(`/api/v1/tasks/${encodeURIComponent(conflict.mutation!.entityId)}`, {
    credentials: 'include',
    cache: 'no-store',
  });
  if (response.status === 404 || response.status === 403) return null;
  if (!response.ok) throw new Error('Could not load the server version. Try again.');
  const task = taskSchema.parse(await response.json());
  if (task.id !== conflict.mutation!.entityId)
    throw new Error('The server returned a different task. Try again.');
  return task;
}

export async function resolveReviewedConflict(
  conflict: ReviewConflict,
  choice: 'local' | 'remote',
  reviewed: Task | null | undefined,
) {
  const action = async () => {
    const mutation = conflict.mutation;
    if (mutation?.entityType !== 'task') {
      if (choice === 'local') {
        const retryableVersionConflict =
          mutation &&
          ['list', 'listItem'].includes(mutation.entityType) &&
          conflict.reason === 'version_mismatch' &&
          conflict.currentVersion !== undefined;
        if (
          !mutation ||
          (!retryableVersionConflict &&
            (!['category', 'project'].includes(mutation.entityType) ||
              !['project_unavailable'].includes(conflict.reason)))
        )
          throw new Error('This change needs an edit or server review before it can be retried.');
        const retry = {
          ...mutation,
          ...(retryableVersionConflict ? { baseVersion: conflict.currentVersion! } : {}),
          attempts: 0,
          createdAt: new Date().toISOString(),
          payload: await encryptLocalValue('mutation', mutation.id, mutation.payload),
        };
        await db.transaction('rw', db.secureConflicts, db.outbox, async () => {
          if (!(await db.secureConflicts.get(conflict.id)))
            throw new Error('This conflict was already resolved.');
          if (await db.outbox.where('entityId').equals(mutation.entityId).count())
            throw new Error('This item has newer pending changes. Let them sync first.');
          await db.outbox.add(retry);
          await db.secureConflicts.delete(conflict.id);
        });
        return;
      }
      // Never leave a failed local Category/Project visible as if it had synced.
      // Preserve it when related work still depends on it so the user can review first.
      await db.transaction(
        'rw',
        [
          db.secureConflicts,
          db.settings,
          db.secureCategories,
          db.secureProjects,
          db.secureTasks,
          db.secureLists,
          db.secureListItems,
          db.outbox,
        ],
        async () => {
          if (mutation?.entityType === 'category' && mutation.operation === 'create') {
            if (await db.secureProjects.where('categoryId').equals(mutation.entityId).count())
              throw new Error('Resolve or move projects in this category before discarding it.');
            if (await db.outbox.where('entityId').equals(mutation.entityId).count())
              throw new Error(
                'This category has newer pending changes. Let them sync before discarding it.',
              );
            await db.secureCategories.delete(mutation.entityId);
          }
          if (mutation?.entityType === 'project' && mutation.operation === 'create') {
            const [tasks, lists, pending] = await Promise.all([
              db.secureTasks.where('projectId').equals(mutation.entityId).count(),
              db.secureLists.where('projectId').equals(mutation.entityId).count(),
              db.outbox.where('entityId').equals(mutation.entityId).count(),
            ]);
            if (tasks || lists)
              throw new Error('Move work out of this project before discarding it.');
            if (pending)
              throw new Error(
                'This project has newer pending changes. Let them sync before discarding it.',
              );
            await db.secureProjects.delete(mutation.entityId);
          }
          if (mutation?.entityType === 'listItem' && conflict.reason === 'hard_deleted')
            await db.secureListItems.delete(mutation.entityId);
          await db.settings.put({ key: 'pending-sync-replay-cursor', value: '{}' });
          await db.secureConflicts.delete(conflict.id);
        },
      );
      return;
    }
    const current = await readConflictTask(conflict);
    if (reviewed === undefined || current?.version !== reviewed?.version)
      throw new Error('The server version changed. Refresh the comparison before choosing.');
    if (
      choice === 'local' &&
      (!current ||
        mutation.operation === 'create' ||
        ['authorization_changed', 'hard_deleted'].includes(conflict.reason))
    )
      throw new Error('This saved change cannot be reapplied to this task.');
    const id = createUlid();
    const retry =
      choice === 'local' && current
        ? {
            ...mutation,
            id,
            baseVersion: current.version,
            attempts: 0,
            createdAt: new Date().toISOString(),
            payload: await encryptLocalValue('mutation', id, mutation.payload),
          }
        : undefined;
    const record = current ? await taskToEncryptedRecord(current) : undefined;
    await db.transaction('rw', db.secureTasks, db.secureConflicts, db.outbox, async () => {
      if (!(await db.secureConflicts.get(conflict.id)))
        throw new Error('This conflict was already resolved.');
      if (await db.outbox.where('entityId').equals(mutation.entityId).count())
        throw new Error(
          'This task has newer pending changes. Let them sync before resolving this conflict.',
        );
      if (retry) await db.outbox.add(retry);
      else if (record) await db.secureTasks.put(record);
      else await db.secureTasks.delete(mutation.entityId);
      await db.secureConflicts.delete(conflict.id);
    });
  };
  if (navigator.locks) await navigator.locks.request('naaseh-sync', action);
  else await action();
}
