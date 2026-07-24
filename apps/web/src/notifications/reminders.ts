import type { Task } from '@naaseh/domain';
export function scheduleReminder(task: Task): number | undefined {
  if (!task.dueAt || Notification.permission !== 'granted') return;
  const delay = Math.max(0, new Date(task.dueAt).getTime() - Date.now());
  return window.setTimeout(
    () =>
      new Notification(task.visibility === 'private' ? "Na'aseh reminder" : task.label, {
        body: task.visibility === 'private' ? 'A private task is due.' : 'This task is due now.',
        tag: task.id,
      }),
    delay,
  );
}
