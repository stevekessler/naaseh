import { canReadTaskAs, type Task } from '@naaseh/domain';
export const authorizedTask = (
  task: Task | undefined,
  actorId: string,
  role: 'admin' | 'user' = 'user',
) => (task && canReadTaskAs(task, { id: actorId, role, active: true }).allowed ? task : undefined);
export const audienceFor = (task: Task) =>
  task.visibility === 'public' ? 'PUBLIC' : `OWNER#${task.ownerId}`;
export const taskReadDecision = (
  task: Task | undefined,
  actor: { id: string; role: 'admin' | 'user'; active: boolean },
) => (task ? canReadTaskAs(task, actor) : { allowed: false, privileged: false });
