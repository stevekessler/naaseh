import {
  createTask,
  createUlid,
  transitionTask,
  type Task,
  type TaskInput,
  type TaskRevision,
} from '@naaseh/domain';
import { db } from './database.js';
import { createDeviceKey, decryptText, encryptText } from '../crypto/vault.js';
import { getClientId } from './client-id.js';

let deviceKeyPromise: Promise<CryptoKey> | undefined;

/**
 * Return the per-browser encryption key. React may start several live queries at
 * once, so key creation is deliberately single-flight. Without this guard two
 * callers can both try to insert the fixed `device` record and IndexedDB rejects
 * one with a ConstraintError, preventing the application from rendering.
 */
async function loadOrCreateDeviceKey() {
  const stored = await db.cryptoKeys.get('device');
  if (stored) return stored.key;
  const key = await createDeviceKey();
  await db.cryptoKeys.put({ id: 'device', key });
  return key;
}

function deviceKey() {
  deviceKeyPromise ??= loadOrCreateDeviceKey().catch((error) => {
    deviceKeyPromise = undefined;
    throw error;
  });
  return deviceKeyPromise;
}
export async function encryptLocalValue(namespace: string, id: string, value: unknown) {
  return encryptText(JSON.stringify(value), await deviceKey(), `${namespace}:${id}`);
}
export async function decryptLocalValue<T>(
  namespace: string,
  id: string,
  value: import('../crypto/vault.js').Ciphertext,
): Promise<T> {
  return JSON.parse(await decryptText(value, await deviceKey(), `${namespace}:${id}`)) as T;
}
export async function taskToEncryptedRecord(task: Task) {
  const value = await encryptText(JSON.stringify(task), await deviceKey(), `task:${task.id}`);
  return {
    id: task.id,
    ownerId: task.ownerId,
    status: task.status,
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(task.dueTimeZone ? { dueTimeZone: task.dueTimeZone } : {}),
    ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
    ...(task.categoryId ? { categoryId: task.categoryId } : {}),
    ...(task.groupId ? { groupId: task.groupId } : {}),
    ...(task.parentId ? { parentId: task.parentId } : {}),
    visibility: task.visibility,
    updatedAt: task.updatedAt,
    value,
  };
}
async function encryptMutationPayload(mutationId: string, payload: unknown) {
  return encryptText(JSON.stringify(payload), await deviceKey(), `mutation:${mutationId}`);
}
const safeRevisionFields = new Set<keyof Task>([
  'link',
  'dueAt',
  'dueTimeZone',
  'assigneeId',
  'categoryId',
  'groupId',
  'parentId',
  'visibility',
  'status',
  'completedAt',
  'completedBy',
  'version',
]);
function localRevisionValues(task: Task, fields: string[]) {
  return Object.fromEntries(
    fields
      .filter((field) => safeRevisionFields.has(field as keyof Task))
      .map((field) => [field, task[field as keyof Task] ?? null]),
  );
}
async function encryptRevision(revision: TaskRevision) {
  return {
    id: revision.id,
    taskId: revision.taskId,
    ...(revision.mutationId ? { mutationId: revision.mutationId } : {}),
    updatedAt: revision.changedAt,
    value: await encryptLocalValue('revision', revision.id, revision),
  };
}
async function migrateLegacyTasks() {
  const legacy = await db.tasks.toArray();
  if (!legacy.length) return;
  const encrypted = await Promise.all(legacy.map(taskToEncryptedRecord));
  await db.transaction('rw', db.tasks, db.secureTasks, async () => {
    await db.secureTasks.bulkPut(encrypted);
    await db.tasks.clear();
  });
}
export async function listLocalTasks(): Promise<Task[]> {
  await migrateLegacyTasks();
  // Perform the observable Dexie read before awaiting Web Crypto. This keeps
  // secureTasks in useLiveQuery's dependency set on both Chromium and WebKit.
  const records = await db.secureTasks.orderBy('updatedAt').reverse().toArray();
  const key = await deviceKey();
  return Promise.all(
    records.map(
      async (record) =>
        JSON.parse(await decryptText(record.value, key, `task:${record.id}`)) as Task,
    ),
  );
}
export async function decryptMutation(record: import('./database.js').StoredMutation) {
  const payload = record.payload as unknown;
  if (payload && typeof payload === 'object' && 'ciphertext' in payload && 'iv' in payload)
    return {
      ...record,
      payload: JSON.parse(
        await decryptText(record.payload, await deviceKey(), `mutation:${record.id}`),
      ),
    };
  return { ...record, payload };
}

export async function saveNewTask(input: TaskInput, actorId: string): Promise<Task> {
  const task = createTask(input, actorId);
  const id = createUlid();
  const sourceClientId = await getClientId();
  const revision: TaskRevision = {
    id: createUlid(),
    taskId: task.id,
    mutationId: id,
    sourceClientId,
    actorId,
    version: 1,
    changedAt: task.createdAt,
    operation: 'create',
    changedFields: Object.keys(input),
    after: localRevisionValues(task, Object.keys(input)),
    syncOutcome: 'local-pending',
  };
  const [storedTask, payload, storedRevision] = await Promise.all([
    taskToEncryptedRecord(task),
    encryptMutationPayload(id, task),
    encryptRevision(revision),
  ]);
  await db.transaction('rw', db.secureTasks, db.secureRevisions, db.outbox, async () => {
    await db.secureTasks.add(storedTask);
    await db.secureRevisions.add(storedRevision);
    await db.outbox.add({
      id,
      entityId: task.id,
      entityType: 'task',
      operation: 'create',
      baseVersion: 0,
      payload,
      createdAt: task.createdAt,
      attempts: 0,
    });
  });
  return task;
}

export async function updateTask(task: Task, patch: Partial<Task>, actorId: string): Promise<Task> {
  const changedFields = Object.keys(patch);
  const operation =
    patch.status === 'completed' ? 'complete' : patch.status === 'open' ? 'reopen' : 'update';
  const transitioned =
    patch.status && patch.status !== task.status
      ? transitionTask(task, patch.status, actorId)
      : { ...task, version: task.version + 1, updatedAt: new Date().toISOString() };
  const next = { ...transitioned, ...patch };
  const id = createUlid();
  const sourceClientId = await getClientId();
  const revision: TaskRevision = {
    id: createUlid(),
    taskId: task.id,
    mutationId: id,
    sourceClientId,
    actorId,
    version: next.version,
    changedAt: next.updatedAt,
    operation,
    changedFields,
    before: localRevisionValues(task, changedFields),
    after: localRevisionValues(next, changedFields),
    syncOutcome: 'local-pending',
  };
  const [storedTask, payload, storedRevision] = await Promise.all([
    taskToEncryptedRecord(next),
    encryptMutationPayload(id, patch),
    encryptRevision(revision),
  ]);
  await db.transaction('rw', db.secureTasks, db.secureRevisions, db.outbox, async () => {
    await db.secureTasks.put(storedTask);
    await db.secureRevisions.add(storedRevision);
    await db.outbox.add({
      id,
      entityId: task.id,
      entityType: 'task',
      operation: 'update',
      baseVersion: task.version,
      payload,
      createdAt: next.updatedAt,
      attempts: 0,
    });
  });
  return next;
}

export async function markRevisionSynced(mutationId: string, outcome: 'applied' | 'replayed') {
  const record = await db.secureRevisions.where('mutationId').equals(mutationId).first();
  if (!record) return;
  const revision = await decryptLocalValue<TaskRevision>('revision', record.id, record.value);
  await db.secureRevisions.put(await encryptRevision({ ...revision, syncOutcome: outcome }));
}
