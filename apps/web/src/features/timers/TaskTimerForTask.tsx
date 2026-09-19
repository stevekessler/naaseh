import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Task, TaskTimerCommand } from '@naaseh/domain';
import { mutateLocalTaskTimer, readLocalTaskTimer } from '../../db/task-timer-repository.js';
import { TaskTimer } from './TaskTimer.js';
import { useTaskTimer } from './useTaskTimer.js';

export function TaskTimerForTask({
  ownerId,
  task,
  compact = false,
}: {
  ownerId: string;
  task: Task;
  compact?: boolean;
}) {
  const timer = useLiveQuery(() => readLocalTaskTimer(ownerId), [ownerId]);
  const [pending, setPending] = useState(false);
  const { projected, announcement } = useTaskTimer(timer);
  async function send(command: TaskTimerCommand) {
    setPending(true);
    try {
      await mutateLocalTaskTimer({ ownerId, command });
    } finally {
      setPending(false);
    }
  }
  if (!projected || projected.taskId !== task.id) {
    return (
      <button
        className="task-timer-trigger"
        type="button"
        aria-label={
          projected ? `Switch timer to ${task.label}` : `Start 10 minute timer for ${task.label}`
        }
        disabled={pending}
        onClick={() => {
          const switching = projected && projected.status !== 'stopped';
          if (switching && !confirm(`Switch the active timer to ${task.label}?`)) return;
          void send(
            projected
              ? { type: 'switch', taskId: task.id }
              : { type: 'start', taskId: task.id, durationSeconds: 600 },
          );
        }}
      >
        {projected ? 'Switch timer' : compact ? 'Start 10 min' : 'Start 10 minute timer'}
      </button>
    );
  }
  return (
    <TaskTimer
      timer={timer!}
      taskLabel={task.label}
      state={pending ? 'pending' : 'idle'}
      announcement={announcement}
      command={send}
    />
  );
}
