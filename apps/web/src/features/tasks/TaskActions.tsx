import type { Task } from '@naaseh/domain';
import { PrivacyControl } from './PrivacyControl.js';
import { PermanentDeleteDialog } from '../archive/PermanentDeleteDialog.js';

export function TaskActions({
  task,
  update,
  csrfToken,
}: {
  task: Task;
  update: (patch: Partial<Task>) => void;
  csrfToken: string;
}) {
  return (
    <div>
      <button
        onClick={() => update({ status: task.lifecycle === 'archived' ? 'open' : 'completed' })}
      >
        {task.lifecycle === 'archived' ? 'Restore and reopen' : 'Complete and archive'}
      </button>
      {task.lifecycle !== 'archived' && (
        <button onClick={() => update({ status: 'archived' })}>Archive without completing</button>
      )}
      <PrivacyControl
        privateTask={task.visibility === 'private'}
        change={(locked) => update({ visibility: locked ? 'private' : 'public' })}
      />
      <PermanentDeleteDialog
        target={{ resourceType: 'task', resourceId: task.id, version: task.version }}
        label={task.label}
        csrfToken={csrfToken}
        disabled={task.lifecycle === 'deleting'}
      />
    </div>
  );
}
