import type { Task } from '@naaseh/domain';
export interface TaskFilters {
  from?: string;
  to?: string;
  assigneeId?: string;
  categoryId?: string;
  status?: Task['status'];
}
export function matchesFilters(task: Task, filters: TaskFilters) {
  return (
    (!filters.from || Boolean(task.dueAt && task.dueAt >= filters.from)) &&
    (!filters.to || Boolean(task.dueAt && task.dueAt <= `${filters.to}T23:59:59.999Z`)) &&
    (!filters.assigneeId || task.assigneeId === filters.assigneeId) &&
    (!filters.categoryId || task.categoryId === filters.categoryId) &&
    (!filters.status || task.status === filters.status)
  );
}
