import { matchesUrgencySet, type Task, type Urgency } from '@naaseh/domain';
export interface TaskFilters {
  from?: string;
  to?: string;
  assigneeId?: string;
  categoryId?: string;
  projectId?: string;
  status?: Task['status'];
  urgencies?: Urgency[];
}
export function taskDueDateKey(task: Pick<Task, 'dueAt' | 'dueDate'>) {
  if (task.dueDate) return task.dueDate;
  if (!task.dueAt) return undefined;
  const due = new Date(task.dueAt);
  const year = due.getFullYear();
  const month = String(due.getMonth() + 1).padStart(2, '0');
  const day = String(due.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
export function matchesFilters(task: Task, filters: TaskFilters) {
  const dueDate = taskDueDateKey(task);
  return (
    (!filters.from || Boolean(dueDate && dueDate >= filters.from)) &&
    (!filters.to || Boolean(dueDate && dueDate <= filters.to)) &&
    (!filters.assigneeId || task.assigneeId === filters.assigneeId) &&
    (!filters.categoryId || task.categoryId === filters.categoryId) &&
    (!filters.projectId ||
      (filters.projectId === 'unassigned'
        ? !task.projectId
        : task.projectId === filters.projectId)) &&
    (!filters.status || task.status === filters.status) &&
    matchesUrgencySet(task.urgency, filters.urgencies)
  );
}
