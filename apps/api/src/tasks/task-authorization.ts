import { canReadTaskAs, type Task } from '@naaseh/domain';
export const authorizedTask = (
  task: Task | undefined,
  actorId: string,
  role: 'admin' | 'user' = 'user',
  groupIds: string[] = [],
) =>
  task && canReadTaskAs(task, { id: actorId, role, active: true, groupIds }).allowed
    ? task
    : undefined;
export const taskReadDecision = (
  task: Task | undefined,
  actor: { id: string; role: 'admin' | 'user'; active: boolean; groupIds: string[] },
) => (task ? canReadTaskAs(task, actor) : { allowed: false, privileged: false });
