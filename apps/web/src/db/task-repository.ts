import {
  createTask,
  createUlid,
  archiveTask,
  completeAndArchiveTask,
  restoreArchivedTask,
  transitionTask,
  matchesUrgencySet,
  taskSchema,
  type Task,
  type TaskInput,
  type TaskRevision,
  type CompletionEvent,
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
    urgency: task.urgency,
    ...(task.dueAt ? { dueAt: task.dueAt } : {}),
    ...(task.dueTimeZone ? { dueTimeZone: task.dueTimeZone } : {}),
    ...(task.assigneeId ? { assigneeId: task.assigneeId } : {}),
    ...(task.categoryId ? { categoryId: task.categoryId } : {}),
    ...(task.projectId ? { projectId: task.projectId } : {}),
    ...(task.groupId ? { groupId: task.groupId } : {}),
    ...(task.parentId ? { parentId: task.parentId } : {}),
    visibility: task.visibility,
    ...(task.lifecycle ? { lifecycle: task.lifecycle } : {}),
    ...(task.completionState ? { completionState: task.completionState } : {}),
    updatedAt: task.updatedAt,
    value,
  };
}
async function encryptMutationPayload(mutationId: string, payload: unknown) {
  return encryptText(JSON.stringify(payload), await deviceKey(), `mutation:${mutationId}`);
}
const safeRevisionFields = new Set<keyof Task>([
  'urgency',
  'link',
  'dueAt',
  'dueTimeZone',
  'assigneeId',
  'categoryId',
  'projectId',
  'groupId',
  'parentId',
  'visibility',
  'status',
  'completedAt',
  'completedBy',
  'lifecycle',
  'completionState',
  'archiveReason',
  'archivedAt',
  'archivedBy',
  'currentCompletionEventId',
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
    records.map(async (record) =>
      taskSchema.parse(JSON.parse(await decryptText(record.value, key, `task:${record.id}`))),
    ),
  );
}

export async function listLocalTasksByUrgency(urgencies: readonly Task['urgency'][]) {
  const tasks = await listLocalTasks();
  return tasks.filter((task) => matchesUrgencySet(task.urgency, urgencies));
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
  const changedFields = [...new Set([...Object.keys(input), 'urgency'])];
  const revision: TaskRevision = {
    id: createUlid(),
    taskId: task.id,
    mutationId: id,
    sourceClientId,
    actorId,
    version: 1,
    changedAt: task.createdAt,
    operation: 'create',
    changedFields,
    after: localRevisionValues(task, changedFields),
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
  const id = createUlid();
  let completionEvent: CompletionEvent | undefined;
  let operation: TaskRevision['operation'] = 'update';
  let transitioned: Task;
  if (patch.status === 'completed' && task.lifecycle !== 'archived') {
    let attribution = {};
    if (task.projectId) {
      const projectRecord = await db.secureProjects.get(task.projectId);
      if (projectRecord) {
        const project = await decryptLocalValue<import('@naaseh/domain').Project>(
          'project',
          projectRecord.id,
          projectRecord.value,
        );
        const categoryRecord = await db.secureCategories.get(project.categoryId);
        if (categoryRecord) {
          const category = await decryptLocalValue<import('@naaseh/domain').CategoryRecord>(
            'category',
            categoryRecord.id,
            categoryRecord.value,
          );
          attribution = {
            projectId: project.id,
            projectName: project.name,
            categoryId: category.id,
            categoryName: category.name,
          };
        }
      }
    }
    const result = completeAndArchiveTask(task, actorId, attribution);
    transitioned = result.task;
    completionEvent = result.completionEvent;
    operation = 'completeAndArchive';
  } else if (patch.status === 'archived' && task.lifecycle !== 'archived') {
    transitioned = archiveTask(task, actorId);
    operation = 'archive';
  } else if (patch.status === 'open' && task.lifecycle === 'archived') {
    const currentEvent = task.currentCompletionEventId
      ? await db.secureCompletionEvents.get(task.currentCompletionEventId)
      : undefined;
    const restored = restoreArchivedTask(
      task,
      currentEvent
        ? await decryptLocalValue<CompletionEvent>(
            'completionEvent',
            currentEvent.id,
            currentEvent.value,
          )
        : undefined,
      actorId,
      id,
    );
    transitioned = restored.task;
    completionEvent = restored.completionEvent;
    operation = 'reopenAndRestore';
  } else {
    transitioned =
      patch.status && patch.status !== task.status
        ? transitionTask(task, patch.status, actorId)
        : { ...task, version: task.version + 1, updatedAt: new Date().toISOString() };
    operation = patch.status === 'open' ? 'reopen' : 'update';
  }
  const lifecyclePatch =
    operation === 'completeAndArchive' ||
    operation === 'archive' ||
    operation === 'reopenAndRestore'
      ? Object.fromEntries(Object.entries(patch).filter(([key]) => key !== 'status'))
      : patch;
  const next = taskSchema.parse({ ...transitioned, ...lifecyclePatch });
  const changedFields = [
    ...new Set([
      ...Object.keys(patch),
      ...(operation === 'update'
        ? []
        : [
            'lifecycle',
            'completionState',
            'archiveReason',
            'archivedAt',
            'archivedBy',
            'currentCompletionEventId',
          ]),
    ]),
  ];
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
  const [storedTask, payload, storedRevision, storedEvent] = await Promise.all([
    taskToEncryptedRecord(next),
    encryptMutationPayload(id, { patch, ...(completionEvent ? { completionEvent } : {}) }),
    encryptRevision(revision),
    completionEvent
      ? Promise.resolve({
          id: completionEvent.id,
          taskId: completionEvent.taskId,
          completedBy: completionEvent.completedBy,
          occurredAt: completionEvent.occurredAt,
          ...(completionEvent.projectIdAtCompletion
            ? { projectId: completionEvent.projectIdAtCompletion }
            : {}),
          ...(completionEvent.categoryIdAtCompletion
            ? { categoryId: completionEvent.categoryIdAtCompletion }
            : {}),
          ...(completionEvent.reversedAt ? { reversedAt: completionEvent.reversedAt } : {}),
          updatedAt: completionEvent.reversedAt ?? completionEvent.occurredAt,
          value: await encryptLocalValue('completionEvent', completionEvent.id, completionEvent),
        })
      : Promise.resolve(undefined),
  ]);
  await db.transaction(
    'rw',
    db.secureTasks,
    db.secureRevisions,
    db.secureCompletionEvents,
    db.outbox,
    async () => {
      await db.secureTasks.put(storedTask);
      await db.secureRevisions.add(storedRevision);
      if (storedEvent) await db.secureCompletionEvents.put(storedEvent);
      await db.outbox.add({
        id,
        entityId: task.id,
        entityType: 'task',
        operation,
        baseVersion: task.version,
        payload,
        createdAt: next.updatedAt,
        attempts: 0,
      });
    },
  );
  return next;
}

export async function markRevisionSynced(mutationId: string, outcome: 'applied' | 'replayed') {
  const record = await db.secureRevisions.where('mutationId').equals(mutationId).first();
  if (!record) return;
  const revision = await decryptLocalValue<TaskRevision>('revision', record.id, record.value);
  await db.secureRevisions.put(await encryptRevision({ ...revision, syncOutcome: outcome }));
}
