import {
  includeInWorkload,
  matchesUrgencySet,
  zeroUrgencyCounts,
  type Urgency,
  type UrgencyCounts,
} from '@naaseh/domain';

export interface LocalWorkload {
  kind: 'task' | 'list';
  lifecycle?: 'active' | 'archived' | 'deleting' | undefined;
  projectId?: string | undefined;
  urgency?: Urgency | undefined;
}
export interface LocalProjectRef {
  id: string;
  categoryId: string;
}
export interface WorkloadCount {
  taskCount: number;
  listCount: number;
  urgencyCounts: UrgencyCounts;
}
const empty = (): WorkloadCount => ({
  taskCount: 0,
  listCount: 0,
  urgencyCounts: zeroUrgencyCounts(),
});
const add = (count: WorkloadCount, item: LocalWorkload) => {
  const urgency = item.urgency ?? 'medium';
  count.urgencyCounts[urgency] += 1;
  const kind = item.kind;
  if (kind === 'task') count.taskCount += 1;
  else count.listCount += 1;
};

export function calculateWorkloadTree(
  projects: readonly LocalProjectRef[],
  work: readonly LocalWorkload[],
  urgencies: readonly Urgency[] = [],
) {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectCounts = new Map<string, WorkloadCount>();
  const categoryCounts = new Map<string, WorkloadCount>();
  const unassigned = empty();
  for (const item of work) {
    if (!includeInWorkload(item) || !matchesUrgencySet(item.urgency ?? 'medium', urgencies))
      continue;
    if (!item.projectId) {
      add(unassigned, item);
      continue;
    }
    const project = projectById.get(item.projectId);
    if (!project) continue;
    const projectCount = projectCounts.get(project.id) ?? empty();
    const categoryCount = categoryCounts.get(project.categoryId) ?? empty();
    add(projectCount, item);
    add(categoryCount, item);
    projectCounts.set(project.id, projectCount);
    categoryCounts.set(project.categoryId, categoryCount);
  }
  return { projects: projectCounts, categories: categoryCounts, unassigned };
}
