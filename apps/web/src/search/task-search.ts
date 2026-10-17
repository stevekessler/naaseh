import MiniSearch from 'minisearch';
import { matchesUrgencySet, type Task, type Urgency } from '@naaseh/domain';
import { matchesDatePresets, taskDueDateKey, type DatePreset } from './task-filters.js';
export interface Filters {
  query: string;
  assigneeId: string;
  assigneeIds?: string[];
  groupIds?: string[];
  match?: 'all' | 'any';
  scope?: 'default' | 'all';
  categoryId: string;
  projectId?: string;
  from: string;
  to: string;
  contentType?: 'all' | 'lists' | 'todos';
  lifecycle?: 'active' | 'archive' | 'all';
  urgencies: Urgency[];
  progress?: 'all' | 'not-started' | 'in-progress' | 'complete';
  datePresets?: DatePreset[];
}
export function matchesProgressFilter(
  percentComplete: number | undefined,
  progress: Filters['progress'],
) {
  const percent = percentComplete ?? 0;
  return (
    !progress ||
    progress === 'all' ||
    (progress === 'not-started' && percent === 0) ||
    (progress === 'in-progress' && percent > 0 && percent < 100) ||
    (progress === 'complete' && percent === 100)
  );
}
export const normalizeSearch = (value: string) =>
  value.normalize('NFKC').trim().toLocaleLowerCase();
export function searchTaskIds(tasks: Task[], query: string): Set<string> {
  const normalized = normalizeSearch(query);
  if (!normalized) return new Set(tasks.map((task) => task.id));
  const index = new MiniSearch<{ id: string; label: string; memo: string }>({
    fields: ['label', 'memo'],
    storeFields: ['id'],
  });
  index.addAll(
    tasks.map((task) => ({
      id: task.id,
      label: task.label,
      memo: task.memoHidden ? '' : task.memo,
    })),
  );
  return new Set(
    index.search(normalized, { prefix: true, fuzzy: 0.2 }).map((hit) => String(hit.id)),
  );
}
export function filterTasks(tasks: Task[], filters: Filters): Task[] {
  return filterTasksForViewer(tasks, filters);
}

export interface TaskFilterViewer {
  userId: string;
  groupIds: readonly string[];
}

export function taskAssigneeIds(filters: Filters): string[] {
  return filters.assigneeIds?.length
    ? [...new Set(filters.assigneeIds)]
    : filters.assigneeId
      ? [filters.assigneeId]
      : [];
}

export function taskIsInDefaultScope(task: Task, viewer: TaskFilterViewer): boolean {
  return (
    task.assigneeId === viewer.userId ||
    Boolean(task.groupId && viewer.groupIds.includes(task.groupId))
  );
}

export function filtersExpandToAllReadable(filters: Filters, viewer: TaskFilterViewer): boolean {
  if (filters.scope === 'all') return true;
  const assigneeIds = taskAssigneeIds(filters);
  return (
    assigneeIds.some((id) => id !== viewer.userId) ||
    (filters.groupIds ?? []).some((id) => !viewer.groupIds.includes(id))
  );
}

export function taskMatchesExpression(task: Task, filters: Filters, ids?: Set<string>): boolean {
  const dueDate = taskDueDateKey(task);
  const assigneeIds = taskAssigneeIds(filters);
  const conditions: boolean[] = [];
  if (filters.query.trim()) conditions.push(Boolean(ids?.has(task.id)));
  if (assigneeIds.length) conditions.push(assigneeIds.includes(task.assigneeId));
  if (filters.groupIds?.length)
    conditions.push(Boolean(task.groupId && filters.groupIds.includes(task.groupId)));
  if (filters.categoryId) conditions.push(task.categoryId === filters.categoryId);
  if (filters.projectId)
    conditions.push(
      filters.projectId === 'unassigned' ? !task.projectId : task.projectId === filters.projectId,
    );
  if (filters.from) conditions.push(Boolean(dueDate && dueDate >= filters.from));
  if (filters.to) conditions.push(Boolean(dueDate && dueDate <= filters.to));
  if (filters.datePresets?.length)
    conditions.push(matchesDatePresets(dueDate, filters.datePresets));
  if (filters.progress && filters.progress !== 'all')
    conditions.push(matchesProgressFilter(task.percentComplete, filters.progress));
  if (filters.urgencies?.length)
    conditions.push(matchesUrgencySet(task.urgency, filters.urgencies));
  if (!conditions.length) return true;
  return filters.match === 'any' ? conditions.some(Boolean) : conditions.every(Boolean);
}

export function filterTasksForViewer(
  tasks: Task[],
  filters: Filters,
  viewer?: TaskFilterViewer,
): Task[] {
  if (filters.contentType === 'lists') return [];
  const ids = filters.query.trim() ? searchTaskIds(tasks, filters.query) : undefined;
  return tasks.filter((task) => {
    return (
      (!viewer ||
        filtersExpandToAllReadable(filters, viewer) ||
        taskIsInDefaultScope(task, viewer)) &&
      (filters.lifecycle === 'all' ||
        (filters.lifecycle === 'archive'
          ? task.lifecycle === 'archived'
          : task.lifecycle !== 'archived' && task.lifecycle !== 'deleting')) &&
      taskMatchesExpression(task, filters, ids)
    );
  });
}
