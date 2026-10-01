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

export function orderTasksForList(
  tasks: readonly Task[],
  storedTaskIds: ReadonlySet<string>,
  ranks: ReadonlyMap<string, number>,
) {
  return [...tasks].sort((left, right) => {
    const leftIsNew = !storedTaskIds.has(left.id);
    const rightIsNew = !storedTaskIds.has(right.id);
    if (leftIsNew !== rightIsNew) return leftIsNew ? -1 : 1;
    if (leftIsNew)
      return right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id);
    return (ranks.get(left.id) ?? Infinity) - (ranks.get(right.id) ?? Infinity);
  });
}
import type { Task } from '@naaseh/domain';
