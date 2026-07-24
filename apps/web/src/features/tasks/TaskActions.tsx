import type { Task } from '@naaseh/domain';
import { PrivacyControl } from './PrivacyControl.js';

export function TaskActions({
  task,
  update,
}: {
  task: Task;
  update: (patch: Partial<Task>) => void;
}) {
  return (
    <div>
      <button
        onClick={() => update({ status: task.status === 'completed' ? 'open' : 'completed' })}
      >
        {task.status === 'completed' ? 'Reopen' : 'Complete'}
      </button>
      <button onClick={() => update({ status: 'archived' })}>Archive</button>
      <PrivacyControl
        privateTask={task.visibility === 'private'}
        change={(locked) => update({ visibility: locked ? 'private' : 'public' })}
      />
    </div>
  );
}
