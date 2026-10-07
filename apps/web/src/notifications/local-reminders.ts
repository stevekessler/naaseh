import type { Task } from '@naaseh/domain';
import { taskDueDateKey } from '../search/task-filters.js';
export function activateDueReminder(task: Task): number | undefined {
  if (!task.dueAt || task.status !== 'open' || Notification.permission !== 'granted') return;
  return window.setTimeout(
    () =>
      new Notification(task.visibility === 'private' ? "Na'aseh reminder" : task.label, {
        body: task.visibility === 'private' ? 'A private task is due.' : 'Task due now',
        tag: task.id,
      }),
    Math.max(0, new Date(task.dueAt).getTime() - Date.now()),
  );
}
export const overdue = (task: Task, now = Date.now()) => {
  if (task.status !== 'open') return false;
  if (task.dueAt) return new Date(task.dueAt).getTime() <= now;
  const dueDate = taskDueDateKey(task);
  if (!dueDate) return false;
  const today = taskDueDateKey({ dueAt: new Date(now).toISOString() });
  return Boolean(today && dueDate < today);
};
