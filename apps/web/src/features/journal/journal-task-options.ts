import type { Task } from '@naaseh/domain';

export function eligibleJournalTasks(tasks: Task[], ownerId: string, today: string) {
  const boundary = new Date(`${today}T00:00:00Z`);
  boundary.setUTCDate(boundary.getUTCDate() - 7);
  const earliest = boundary.toISOString().slice(0, 10);
  return tasks.filter(
    (task) =>
      task.ownerId === ownerId &&
      (task.status === 'open' ||
        (task.status === 'completed' &&
          Boolean(task.updatedAt && task.updatedAt.slice(0, 10) >= earliest))),
  );
}
export function resolveJournalTaskLabel(tasks: Task[], taskId: string) {
  return tasks.find((task) => task.id === taskId)?.label ?? 'Task unavailable';
}
