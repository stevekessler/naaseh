import { useMemo } from 'react';
import type { CategoryRecord, List, Project, Task } from '@naaseh/domain';
import { calculateWorkloadTree } from '../../db/workload-selector.js';

export function useWorkloadTree(
  categories: CategoryRecord[],
  projects: Project[],
  tasks: Task[],
  lists: List[],
) {
  return useMemo(() => {
    const counts = calculateWorkloadTree(projects, [
      ...tasks.map((task) => ({
        kind: 'task' as const,
        lifecycle: task.lifecycle,
        projectId: task.projectId,
      })),
      ...lists.map((list) => ({
        kind: 'list' as const,
        lifecycle: list.lifecycle,
        projectId: list.projectId,
      })),
    ]);
    return {
      categories: categories.map((category) => ({
        category,
        count: counts.categories.get(category.id) ?? { taskCount: 0, listCount: 0 },
        projects: projects
          .filter((project) => project.categoryId === category.id)
          .map((project) => ({
            project,
            count: counts.projects.get(project.id) ?? { taskCount: 0, listCount: 0 },
          })),
      })),
      unassigned: counts.unassigned,
      asOf: new Date().toISOString(),
    };
  }, [categories, projects, tasks, lists]);
}
