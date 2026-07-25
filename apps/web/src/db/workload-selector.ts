import { includeInWorkload } from '@naaseh/domain';

export interface LocalWorkload {
  kind: 'task' | 'list';
  lifecycle?: 'active' | 'archived' | 'deleting' | undefined;
  projectId?: string | undefined;
}
export interface LocalProjectRef {
  id: string;
  categoryId: string;
}
export interface WorkloadCount {
  taskCount: number;
  listCount: number;
}
const empty = (): WorkloadCount => ({ taskCount: 0, listCount: 0 });
const add = (count: WorkloadCount, kind: LocalWorkload['kind']) => {
  if (kind === 'task') count.taskCount += 1;
  else count.listCount += 1;
};

export function calculateWorkloadTree(
  projects: readonly LocalProjectRef[],
  work: readonly LocalWorkload[],
) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectCounts = new Map<string, WorkloadCount>();
  const categoryCounts = new Map<string, WorkloadCount>();
  const unassigned = empty();
  for (const item of work) {
    if (!includeInWorkload(item)) continue;
    if (!item.projectId) {
      add(unassigned, item.kind);
      continue;
    }
    const project = projectById.get(item.projectId);
    if (!project) continue;
    const projectCount = projectCounts.get(project.id) ?? empty();
    const categoryCount = categoryCounts.get(project.categoryId) ?? empty();
    add(projectCount, item.kind);
    add(categoryCount, item.kind);
    projectCounts.set(project.id, projectCount);
    categoryCounts.set(project.categoryId, categoryCount);
  }
  return { projects: projectCounts, categories: categoryCounts, unassigned };
}
