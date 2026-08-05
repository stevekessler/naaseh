import {
  createProject,
  projectEffectivelyAssignable,
  updateProject,
  type List,
  type Task,
} from '@naaseh/domain';
import { getCategory } from '../categories/category-repository.js';
import { createProjectRecord, getProject, updateProjectRecord } from './project-repository.js';
import { notifyStackMembershipWorkChange } from '../ranking/stack-membership-lifecycle.js';

export async function createManagedProject(input: {
  categoryId: string;
  name: string;
  endDate?: string;
}) {
  const category = await getCategory(input.categoryId);
  if (!category) throw new Error('Category not found.');
  const project = createProject({
    ...input,
    ...(category.groupId ? { groupId: category.groupId } : {}),
  });
  return createProjectRecord(project);
}

export async function editManagedProject(
  currentId: string,
  patch: Parameters<typeof updateProject>[1],
  expectedVersion: number,
) {
  const current = await getProject(currentId);
  if (!current) throw new Error('Project not found.');
  if (current.version !== expectedVersion) throw new Error('Project version changed.');
  const category = await getCategory(patch.categoryId ?? current.categoryId);
  if (!category) throw new Error('Category not found.');
  const next = updateProject(current, {
    ...patch,
    ...(category.groupId ? { groupId: category.groupId } : {}),
  });
  return updateProjectRecord(current, next);
}

export async function resolveProjectAssignment(projectId: string | null) {
  if (!projectId) return {} as { projectId?: string; categoryId?: string };
  const project = await getProject(projectId);
  if (!project) throw new Error('Project not found.');
  const category = await getCategory(project.categoryId);
  if (!category || !projectEffectivelyAssignable(project, category))
    throw new Error('Project is not available for assignment.');
  return { projectId: project.id, categoryId: project.categoryId };
}

export const assignWorkToProject = <T extends Task | List>(
  work: T,
  assignment: { projectId?: string; categoryId?: string },
): T => {
  const next = {
    ...work,
    projectId: assignment.projectId,
    ...('categoryId' in work ? { categoryId: assignment.categoryId } : {}),
    updatedAt: new Date().toISOString(),
    version: work.version + 1,
  } as T;
  notifyStackMembershipWorkChange('label' in work ? 'task' : 'list', work, next, 'project');
  return next;
};
