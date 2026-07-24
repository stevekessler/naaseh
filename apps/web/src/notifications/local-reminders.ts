import type { Task } from '@naaseh/domain';
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
export const overdue = (task: Task, now = Date.now()) =>
  task.status === 'open' && Boolean(task.dueAt && new Date(task.dueAt).getTime() <= now);
