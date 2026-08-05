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
        urgency: task.urgency,
      })),
      ...lists.map((list) => ({
        kind: 'list' as const,
        lifecycle: list.lifecycle,
        projectId: list.projectId,
        urgency: list.urgency,
      })),
    ]);
    return {
      categories: categories.map((category) => ({
        category,
        count: counts.categories.get(category.id) ?? {
          taskCount: 0,
          listCount: 0,
          urgencyCounts: {
            extra_low: 0,
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
          },
        },
        projects: projects
          .filter((project) => project.categoryId === category.id)
          .map((project) => ({
            project,
            count: counts.projects.get(project.id) ?? {
              taskCount: 0,
              listCount: 0,
              urgencyCounts: {
                extra_low: 0,
                low: 0,
                medium: 0,
                high: 0,
                critical: 0,
              },
            },
          })),
      })),
      unassigned: counts.unassigned,
      asOf: new Date().toISOString(),
    };
  }, [categories, projects, tasks, lists]);
}
