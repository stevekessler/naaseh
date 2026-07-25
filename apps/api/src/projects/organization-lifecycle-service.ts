import {
  archiveCategory,
  archiveProject,
  projectEffectivelyAssignable,
  restoreCategory,
  restoreProject,
  type CategoryRecord,
  type Project,
} from '@naaseh/domain';
import { getCategory, updateCategoryRecord } from '../categories/category-repository.js';
import { getProject, updateProjectRecord } from './project-repository.js';

const requireVersion = <T extends { version: number }>(value: T | undefined, expected: number) => {
  if (!value) throw new Error('Organization node not found.');
  if (value.version !== expected) throw new Error('Organization node version changed.');
  return value;
};

export async function changeCategoryLifecycle(input: {
  categoryId: string;
  action: 'archive' | 'restore';
  actorId: string;
  expectedVersion: number;
}) {
  const current = requireVersion(await getCategory(input.categoryId), input.expectedVersion);
  const next =
    input.action === 'archive' ? archiveCategory(current, input.actorId) : restoreCategory(current);
  await updateCategoryRecord(current, next);
  return next;
}

export async function changeProjectLifecycle(input: {
  projectId: string;
  action: 'archive' | 'restore';
  actorId: string;
  expectedVersion: number;
}) {
  const current = requireVersion(await getProject(input.projectId), input.expectedVersion);
  const next =
    input.action === 'archive' ? archiveProject(current, input.actorId) : restoreProject(current);
  await updateProjectRecord(current, next);
  return next;
}

export const effectiveProjectAvailability = (project: Project, category: CategoryRecord) => ({
  assignable: projectEffectivelyAssignable(project, category),
  reason:
    category.lifecycle === 'archived' || category.archived
      ? 'Its Category is archived.'
      : project.lifecycle === 'archived'
        ? 'This Project is archived.'
        : undefined,
});
