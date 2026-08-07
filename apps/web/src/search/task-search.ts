import MiniSearch from 'minisearch';
import { matchesUrgencySet, type Task, type Urgency } from '@naaseh/domain';
export interface Filters {
  query: string;
  assigneeId: string;
  categoryId: string;
  projectId?: string;
  from: string;
  to: string;
  contentType?: 'all' | 'lists' | 'todos';
  lifecycle?: 'active' | 'archive' | 'all';
  urgencies: Urgency[];
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
  if (filters.contentType === 'lists') return [];
  const ids = filters.query.trim() ? searchTaskIds(tasks, filters.query) : undefined;
  return tasks.filter(
    (task) =>
      (!ids || ids.has(task.id)) &&
      (filters.lifecycle === 'all' ||
        (filters.lifecycle === 'archive'
          ? task.lifecycle === 'archived'
          : task.lifecycle !== 'archived' && task.lifecycle !== 'deleting')) &&
      (!filters.assigneeId || task.assigneeId === filters.assigneeId) &&
      (!filters.categoryId || task.categoryId === filters.categoryId) &&
      (!filters.projectId ||
        (filters.projectId === 'unassigned'
          ? !task.projectId
          : task.projectId === filters.projectId)) &&
      (!filters.from || Boolean(task.dueAt && task.dueAt >= filters.from)) &&
      (!filters.to || Boolean(task.dueAt && task.dueAt <= `${filters.to}T23:59:59.999Z`)) &&
      matchesUrgencySet(task.urgency, filters.urgencies),
  );
}
