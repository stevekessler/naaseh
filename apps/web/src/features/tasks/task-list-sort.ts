import { urgencyValues, type CategoryRecord, type Project, type Task } from '@naaseh/domain';
import { taskDueDateKey } from '../../search/task-filters.js';
import { db } from '../../db/database.js';

export type TaskListSortKey = 'due' | 'category' | 'project' | 'priority';
export type TaskListSortDirection = 'ascending' | 'descending';
export interface TaskListSort {
  key: TaskListSortKey;
  direction: TaskListSortDirection;
}

const taskListSortSettingKey = 'task-list-manual-sort';

export async function loadTaskListSort(): Promise<TaskListSort | undefined> {
  const setting = await db.settings.get(taskListSortSettingKey);
  if (!setting) return undefined;
  try {
    const candidate = JSON.parse(setting.value) as Partial<TaskListSort>;
    if (
      ['due', 'category', 'project', 'priority'].includes(candidate.key ?? '') &&
      ['ascending', 'descending'].includes(candidate.direction ?? '')
    )
      return candidate as TaskListSort;
  } catch {
    // An invalid local preference falls back to the automatic task order.
  }
  return undefined;
}

export const saveTaskListSort = (sort: TaskListSort) =>
  db.settings.put({ key: taskListSortSettingKey, value: JSON.stringify(sort) });

export const resetTaskListSort = () => db.settings.delete(taskListSortSettingKey);

const textCollator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

function compareOptional(
  left: string | number | undefined,
  right: string | number | undefined,
  direction: TaskListSortDirection,
) {
  if (left === undefined && right === undefined) return 0;
  if (left === undefined) return 1;
  if (right === undefined) return -1;
  const comparison =
    typeof left === 'number' && typeof right === 'number'
      ? left - right
      : textCollator.compare(String(left), String(right));
  return direction === 'ascending' ? comparison : -comparison;
}

export function sortTasksForTable(
  tasks: readonly Task[],
  sort: TaskListSort | undefined,
  categories: readonly CategoryRecord[],
  projects: readonly Project[],
) {
  if (!sort) return [...tasks];
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projectRecords = new Map(projects.map((project) => [project.id, project]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const value = (task: Task): string | number | undefined => {
    if (sort.key === 'due') {
      const date = taskDueDateKey(task);
      return date ? `${date}${task.dueAt ?? ''}` : undefined;
    }
    if (sort.key === 'project')
      return task.projectId ? projectNames.get(task.projectId) : undefined;
    if (sort.key === 'category') {
      const categoryId = task.categoryId ?? projectRecords.get(task.projectId ?? '')?.categoryId;
      return categoryId ? categoryNames.get(categoryId) : undefined;
    }
    return urgencyValues.indexOf(task.urgency);
  };
  return tasks
    .map((task, index) => ({ task, index }))
    .sort(
      (left, right) =>
        compareOptional(value(left.task), value(right.task), sort.direction) ||
        left.index - right.index,
    )
    .map(({ task }) => task);
}
