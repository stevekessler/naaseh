import {
  archiveProject,
  createProject,
  createUlid,
  restoreProject,
  updateProject,
  type Project,
} from '@naaseh/domain';
import { db } from './database.js';
import { atomicEncryptedEntityAndMutation } from './outbox.js';
import { decryptLocalValue, encryptLocalValue } from './task-repository.js';

const record = async (project: Project) => ({
  id: project.id,
  categoryId: project.categoryId,
  lifecycle: project.lifecycle,
  updatedAt: project.updatedAt,
  value: await encryptLocalValue('project', project.id, project),
});

export async function listLocalProjects() {
  return Promise.all(
    (await db.secureProjects.toArray()).map((item) =>
      decryptLocalValue<Project>('project', item.id, item.value),
    ),
  );
}

export async function saveNewLocalProject(input: {
  categoryId: string;
  name: string;
  endDate?: string;
}) {
  const project = createProject(input);
  const id = createUlid();
  await atomicEncryptedEntityAndMutation(await record(project), {
    id,
    entityId: project.id,
    entityType: 'project',
    operation: 'create',
    baseVersion: 0,
    payload: await encryptLocalValue('mutation', id, project),
    createdAt: project.createdAt,
    attempts: 0,
  });
  return project;
}

export async function updateLocalProject(
  current: Project,
  patch: Parameters<typeof updateProject>[1],
) {
  const project = updateProject(current, patch);
  const id = createUlid();
  await atomicEncryptedEntityAndMutation(await record(project), {
    id,
    entityId: project.id,
    entityType: 'project',
    operation: patch.categoryId ? 'update' : 'update',
    baseVersion: current.version,
    payload: await encryptLocalValue('mutation', id, patch),
    createdAt: project.updatedAt,
    attempts: 0,
  });
  return project;
}

export async function changeLocalProjectLifecycle(
  current: Project,
  action: 'archive' | 'restore',
  actorId: string,
) {
  const project = action === 'archive' ? archiveProject(current, actorId) : restoreProject(current);
  const id = createUlid();
  await atomicEncryptedEntityAndMutation(await record(project), {
    id,
    entityId: project.id,
    entityType: 'project',
    operation: action === 'archive' ? 'archiveOrganization' : 'restoreOrganization',
    baseVersion: current.version,
    payload: await encryptLocalValue('mutation', id, { action }),
    createdAt: project.updatedAt,
    attempts: 0,
  });
  return project;
}

export async function purgeLocalProject(id: string) {
  await db.transaction('rw', db.secureProjects, db.outbox, db.secureConflicts, async () => {
    await db.secureProjects.delete(id);
    await db.outbox.where('entityId').equals(id).delete();
    await db.secureConflicts.where('id').equals(id).delete();
  });
}

export const projectsByCategory = (projects: readonly Project[]) => {
  const grouped = new Map<string, Project[]>();
  for (const project of projects)
    grouped.set(project.categoryId, [...(grouped.get(project.categoryId) ?? []), project]);
  for (const values of grouped.values())
    values.sort((left, right) => left.name.localeCompare(right.name));
  return grouped;
};
