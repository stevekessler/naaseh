import type { CategoryRecord, Project } from '@naaseh/domain';

export interface ReturnTypeWorkloadTree {
  categories: Array<{
    category: CategoryRecord;
    count: { taskCount: number; listCount: number };
    projects: Array<{
      project: Project;
      count: { taskCount: number; listCount: number };
    }>;
  }>;
  unassigned: { taskCount: number; listCount: number };
  asOf: string;
}
