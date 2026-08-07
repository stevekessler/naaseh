import type { CategoryRecord, Project, UrgencyCounts } from '@naaseh/domain';

interface WorkloadCount {
  taskCount: number;
  listCount: number;
  urgencyCounts?: UrgencyCounts;
}

export interface ReturnTypeWorkloadTree {
  categories: Array<{
    category: CategoryRecord;
    count: WorkloadCount;
    projects: Array<{
      project: Project;
      count: WorkloadCount;
    }>;
  }>;
  unassigned: WorkloadCount;
  asOf: string;
}
