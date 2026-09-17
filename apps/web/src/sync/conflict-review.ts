import { createUlid, taskSchema, type Mutation, type Task } from '@naaseh/domain';
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
}

export async function listReviewConflicts(): Promise<ReviewConflict[]> {
  return Promise.all(
    (await db.secureConflicts.toArray()).map(async (record) => {
      try {
        const saved = await decryptLocalValue<{
          mutation?: Mutation;
          result?: { reason?: string; problem?: { reason?: string } };
        }>('conflict', record.id, record.value);
        return {
          id: record.id,
          createdAt: record.updatedAt,
          mutation: saved.mutation,
          reason: saved.result?.reason ?? saved.result?.problem?.reason ?? 'version_mismatch',
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
      if (choice === 'local') throw new Error('This change cannot be reapplied here.');
      // Acknowledge the saved failed operation; download authorized state again.
      await db.transaction('rw', db.secureConflicts, db.settings, async () => {
        await db.settings.put({ key: 'pending-sync-replay-cursor', value: '{}' });
        await db.secureConflicts.delete(conflict.id);
      });
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
