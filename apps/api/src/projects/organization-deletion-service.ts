import type { CategoryRecord, Project } from '@naaseh/domain';
import { getCategory, deleteEmptyCategoryRecord } from '../categories/category-repository.js';
import { scanReferences } from '../deletion/deletion-repository.js';
import { getProject, listProjects, deleteEmptyProjectRecord } from './project-repository.js';

export interface OrganizationDeletionState {
  resourceType: 'category' | 'project';
  resource: CategoryRecord | Project;
  blockers: string[];
  dependentCounts: Record<string, number>;
}

export async function inspectOrganizationDeletion(
  resourceType: 'category' | 'project',
  resourceId: string,
): Promise<OrganizationDeletionState> {
  const resource =
    resourceType === 'category' ? await getCategory(resourceId) : await getProject(resourceId);
  if (!resource) throw new Error('Organization node not found.');
  const [children, references] = await Promise.all([
    resourceType === 'category' ? listProjects(resourceId) : Promise.resolve([]),
    scanReferences(resourceId, [
      resourceType === 'category' ? 'categoryId' : 'projectId',
      resourceType === 'category' ? 'categoryIdAtCompletion' : 'projectIdAtCompletion',
      'resourceId',
    ]),
  ]);
  const dependentCounts = { projects: children.length, references: references.length };
  const blockers = [
    ...(children.length
      ? [`${children.length} Project${children.length === 1 ? '' : 's'} remain.`]
      : []),
    ...(references.length
      ? [
          `${references.length} work, history, projection, or job reference${references.length === 1 ? '' : 's'} remain.`,
        ]
      : []),
  ];
  return { resourceType, resource, blockers, dependentCounts };
}

export async function permanentlyDeleteEmptyOrganization(input: {
  resourceType: 'category' | 'project';
  resourceId: string;
  expectedVersion: number;
}) {
  const state = await inspectOrganizationDeletion(input.resourceType, input.resourceId);
  if (state.resource.version !== input.expectedVersion)
    throw new Error('Organization node version changed.');
  if (state.blockers.length) throw new Error('Organization node is not empty.');
  if (input.resourceType === 'category')
    await deleteEmptyCategoryRecord(state.resource as CategoryRecord);
  else await deleteEmptyProjectRecord(state.resource as Project);
  return state;
}
