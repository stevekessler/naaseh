import { createHash } from 'node:crypto';
import { completionEventSchema, projectSchema, type Task } from '@naaseh/domain';
import { listCategories } from '../categories/category-repository.js';
import { keys } from '../shared/keys.js';
import { putRecord } from '../shared/store.js';
import { listOwnerTasks } from '../shared/store.js';
import { createProjectRecord, getProject } from './project-repository.js';
import { getMigrationCheckpoint, putMigrationCheckpoint } from './migration-repository.js';

const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function generalProjectIdentity(categoryId: string) {
  const bytes = createHash('sha256').update(`naaseh:general-project:${categoryId}`).digest();
  let value = '0';
  for (let index = 0; index < 25; index += 1) value += alphabet[bytes[index]! % 32];
  return value;
}

export async function ensureGeneralProject(categoryId: string) {
  const id = generalProjectIdentity(categoryId);
  const existing = await getProject(id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const project = projectSchema.parse({
    id,
    categoryId,
    name: 'General',
    lifecycle: 'active',
    createdAt: now,
    updatedAt: now,
    version: 1,
  });
  try {
    return await createProjectRecord(project);
  } catch (error) {
    const raced = await getProject(id);
    if (raced) return raced;
    throw error;
  }
}

export async function migrateLegacyTask(task: Task) {
  if (!task.categoryId || task.projectId) return task;
  const project = await ensureGeneralProject(task.categoryId);
  const next = {
    ...task,
    projectId: project.id,
    updatedAt: new Date().toISOString(),
    version: task.version + 1,
  };
  await putRecord({
    ...keys.task(task.id),
    data: next,
    version: next.version,
    GSI1PK: task.visibility === 'public' ? 'TASK#PUBLIC' : `TASK#OWNER#${task.ownerId}`,
    GSI1SK: next.updatedAt,
    GSI2PK: `TASK#OWNER#${task.ownerId}`,
    GSI2SK: next.updatedAt,
  });
  if (task.completedAt && task.completedBy && !task.currentCompletionEventId) {
    const event = completionEventSchema.parse({
      id: generalProjectIdentity(`completion:${task.id}`),
      taskId: task.id,
      completedBy: task.completedBy,
      occurredAt: task.completedAt,
      projectIdAtCompletion: project.id,
      projectNameAtCompletion: project.name,
      categoryIdAtCompletion: project.categoryId,
      counted: true,
      createdAt: task.completedAt,
    });
    await putRecord({ ...keys.completionEventById(event.id), data: event });
  }
  return next;
}

export async function runCategoryProjectMigration(ownerIds: string[]) {
  const checkpoint = await getMigrationCheckpoint('category-project-v3', 'main');
  let migrated = Number(checkpoint?.migrated ?? 0);
  for (const category of await listCategories()) await ensureGeneralProject(category.id);
  for (const ownerId of ownerIds)
    for (const task of await listOwnerTasks(ownerId)) {
      const next = await migrateLegacyTask(task);
      if (next !== task) migrated += 1;
    }
  await putMigrationCheckpoint('category-project-v3', {
    id: 'main',
    status: 'verified',
    expected: migrated,
    migrated,
    updatedAt: new Date().toISOString(),
  });
  return { migrated, completed: true };
}
