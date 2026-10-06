import type { Task } from '@naaseh/domain';

export interface TaskViewState {
  focusedTaskId?: string;
  scrollY: number;
  query: string;
}
let state: TaskViewState = { scrollY: 0, query: '' };
export const rememberTaskView = (next: TaskViewState) => {
  state = next;
};
export const restoreTaskView = () => state;

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function isTaskDueTodayOrPast(task: Pick<Task, 'dueAt' | 'dueDate'>, now = new Date()) {
  const dueDate = task.dueDate ?? (task.dueAt ? localDateKey(new Date(task.dueAt)) : undefined);
  return dueDate !== undefined && dueDate <= localDateKey(now);
}

export function orderTasksForList(
  tasks: readonly Task[],
  storedTaskIds: ReadonlySet<string>,
  ranks: ReadonlyMap<string, number>,
  now = new Date(),
) {
  return [...tasks].sort((left, right) => {
    const leftIsDue = isTaskDueTodayOrPast(left, now);
    const rightIsDue = isTaskDueTodayOrPast(right, now);
    if (leftIsDue !== rightIsDue) return leftIsDue ? -1 : 1;
    const leftIsNew = !storedTaskIds.has(left.id);
    const rightIsNew = !storedTaskIds.has(right.id);
    if (leftIsNew !== rightIsNew) return leftIsNew ? -1 : 1;
    if (leftIsNew)
      return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
    return (ranks.get(left.id) ?? Infinity) - (ranks.get(right.id) ?? Infinity);
  });
}
