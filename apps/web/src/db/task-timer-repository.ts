import {
  applyTaskTimerCommand,
  createTaskTimer,
  createUlid,
  effectiveTaskTimer,
  taskTimerSchema,
  type TaskTimer,
  type TaskTimerCommand,
  type TaskTimerFeedbackIdentity,
} from '@naaseh/domain';
import { db } from './database.js';
import { getClientId } from './client-id.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

export interface LocalTaskTimerConflict {
  id: string;
  ownerId: string;
  mutationId: string;
  reason: 'version_mismatch' | 'authorization_changed' | 'validation_failed';
  local: TaskTimer;
  remote?: TaskTimer;
  quarantined: boolean;
  createdAt: string;
  command?: TaskTimerCommand;
}

const timerRecord = async (timer: TaskTimer) => ({
  id: timer.ownerId,
  ownerId: timer.ownerId,
  taskId: timer.taskId,
  updatedAt: timer.updatedAt,
  value: await encryptLocalValue('taskTimer', timer.ownerId, timer),
});

export async function readLocalTaskTimer(ownerId: string) {
  const record = await db.secureTaskTimers.get(ownerId);
  return record
    ? taskTimerSchema.parse(await decryptLocalValue<TaskTimer>('taskTimer', ownerId, record.value))
    : undefined;
}

export async function mutateLocalTaskTimer(input: {
  ownerId: string;
  command: TaskTimerCommand;
  now?: string;
}): Promise<TaskTimer> {
  const current = await readLocalTaskTimer(input.ownerId);
  const acceptedAt = input.now ?? new Date().toISOString();
  let next: TaskTimer;
  if (!current) {
    if (input.command.type !== 'start') throw new Error('Start a task timer before changing it');
    next = createTaskTimer(
      input.ownerId,
      input.command.taskId,
      acceptedAt,
      createUlid(),
      input.command.durationSeconds,
    );
  } else {
    if (input.command.type === 'start') throw new Error('Confirm switching the active task timer');
    next = applyTaskTimerCommand(current, input.command, acceptedAt, createUlid());
  }
  const mutationId = createUlid();
  const sourceClientId = await getClientId();
  next = taskTimerSchema.parse({ ...next, lastMutationId: mutationId, sourceClientId });
  const [stored, payload] = await Promise.all([
    timerRecord(next),
    encryptLocalValue('mutation', mutationId, input.command),
  ]);
  await db.transaction('rw', db.secureTaskTimers, db.outbox, async () => {
    await db.secureTaskTimers.put(stored);
    await db.outbox.add({
      id: mutationId,
      entityId: input.ownerId,
      entityType: 'taskTimer',
      operation: 'timerCommand',
      baseVersion: current?.version ?? 0,
      payload,
      createdAt: acceptedAt,
      attempts: 0,
    });
  });
  return next;
}

export async function projectLocalTaskTimer(ownerId: string, now = new Date().toISOString()) {
  const timer = await readLocalTaskTimer(ownerId);
  return timer ? effectiveTaskTimer(timer, now) : undefined;
}

export async function claimTimerFeedback(
  ownerId: string,
  taskId: string,
  identity: TaskTimerFeedbackIdentity,
) {
  const id = `${identity.runId}:${identity.intervalOrdinal}`;
  if (await db.secureTimerCheckpoints.get(id)) return false;
  const record = {
    id,
    ownerId,
    taskId,
    updatedAt: new Date().toISOString(),
    value: await encryptLocalValue('timerFeedback', id, identity),
  };
  try {
    await db.secureTimerCheckpoints.add(record);
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'ConstraintError') return false;
    throw error;
  }
}

export async function storeTaskTimerConflict(conflict: LocalTaskTimerConflict) {
  await db.secureConflicts.put({
    id: conflict.id,
    ownerId: conflict.ownerId,
    taskId: conflict.local.taskId,
    updatedAt: conflict.createdAt,
    value: await encryptLocalValue('taskTimerConflict', conflict.id, conflict),
  });
}

export async function conflictLocalTaskTimer(input: {
  ownerId: string;
  mutationId: string;
  reason: LocalTaskTimerConflict['reason'];
  command: TaskTimerCommand;
}) {
  const local = await readLocalTaskTimer(input.ownerId);
  if (!local) throw new Error('Local task timer is unavailable');
  const conflict: LocalTaskTimerConflict = {
    id: input.mutationId,
    ownerId: input.ownerId,
    mutationId: input.mutationId,
    reason: input.reason,
    local,
    command: input.command,
    quarantined: input.reason === 'authorization_changed',
    createdAt: new Date().toISOString(),
  };
  const record = {
    id: conflict.id,
    ownerId: conflict.ownerId,
    taskId: conflict.local.taskId,
    updatedAt: conflict.createdAt,
    value: await encryptLocalValue('taskTimerConflict', conflict.id, conflict),
  };
  await db.transaction('rw', db.secureConflicts, db.outbox, async () => {
    await db.secureConflicts.put(record);
    await db.outbox.delete(input.mutationId);
  });
}

export async function listLocalTaskTimerConflicts(ownerId: string) {
  const records = await db.secureConflicts.where('ownerId').equals(ownerId).toArray();
  const conflicts: LocalTaskTimerConflict[] = [];
  for (const record of records) {
    try {
      conflicts.push(
        await decryptLocalValue<LocalTaskTimerConflict>(
          'taskTimerConflict',
          record.id,
          record.value,
        ),
      );
    } catch {
      // Other conflict entity types use a different associated-data namespace.
    }
  }
  return conflicts;
}

export async function resolveLocalTaskTimerConflict(
  conflict: LocalTaskTimerConflict,
  resolution: 'reapply' | 'discard',
) {
  if (resolution === 'reapply') {
    if (conflict.quarantined || !conflict.command)
      throw new Error('This timer conflict cannot be reapplied after task access changed');
    await mutateLocalTaskTimer({ ownerId: conflict.ownerId, command: conflict.command });
  }
  await db.secureConflicts.delete(conflict.id);
}

export async function purgeLocalTaskTimer(ownerId: string, taskId?: string) {
  const current = await db.secureTaskTimers.get(ownerId);
  if (taskId && current?.taskId !== taskId) return;
  const checkpoints = await db.secureTimerCheckpoints.where('ownerId').equals(ownerId).toArray();
  const timerMutations = await db.outbox.where('entityType').equals('taskTimer').toArray();
  await db.transaction(
    'rw',
    db.secureTaskTimers,
    db.secureTimerCheckpoints,
    db.outbox,
    async () => {
      await db.secureTaskTimers.delete(ownerId);
      await db.secureTimerCheckpoints.bulkDelete(checkpoints.map(({ id }) => id));
      await db.outbox.bulkDelete(timerMutations.map(({ id }) => id));
    },
  );
}
