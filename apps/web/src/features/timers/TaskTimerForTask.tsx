import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Task, TaskTimerCommand } from '@naaseh/domain';
import { mutateLocalTaskTimer, readLocalTaskTimer } from '../../db/task-timer-repository.js';
import { TaskTimer } from './TaskTimer.js';
import { isActiveTaskTimer, useTaskTimer } from './useTaskTimer.js';

export function TaskTimerForTask({
  ownerId,
  task,
  compact = false,
  onDismiss,
}: {
  ownerId: string;
  task: Task;
  compact?: boolean;
  onDismiss?: () => void;
}) {
  const timer = useLiveQuery(() => readLocalTaskTimer(ownerId), [ownerId]);
  const [pending, setPending] = useState(false);
  const [dismissedRunId, setDismissedRunId] = useState<string>();
  const { projected, announcement } = useTaskTimer(timer);
  async function send(command: TaskTimerCommand) {
    setPending(true);
    try {
      await mutateLocalTaskTimer({ ownerId, command });
    } finally {
      setPending(false);
    }
  }
  const active = isActiveTaskTimer(projected);
  if (!active || projected.taskId !== task.id) {
    const switching = active && projected.taskId !== task.id;
    const startingFresh = !timer;
    return (
      <>
        <button
          className="task-timer-trigger"
          type="button"
          aria-label={
            switching
              ? `Switch timer to ${task.label}`
              : startingFresh
                ? `Start 10 minute timer for ${task.label}`
                : `Start timer for ${task.label}`
          }
          disabled={pending}
          onClick={() => {
            if (switching && !confirm(`Switch the active timer to ${task.label}?`)) return;
            void send(
              switching
                ? { type: 'switch', taskId: task.id }
                : startingFresh
                  ? { type: 'start', taskId: task.id, durationSeconds: 600 }
                  : projected?.taskId === task.id
                    ? { type: 'restart' }
                    : { type: 'switch', taskId: task.id },
            );
          }}
        >
          {switching
            ? 'Switch timer'
            : startingFresh
              ? compact
                ? 'Start 10 min'
                : 'Start 10 minute timer'
              : 'Start timer'}
        </button>
        <span className="visually-hidden" role="status" aria-live="polite">
          {announcement}
        </span>
      </>
    );
  }
  if (compact && dismissedRunId === projected.runId) {
    return (
      <button
        className="task-timer-trigger"
        type="button"
        aria-label={`Show timer for ${task.label}`}
        onClick={() => setDismissedRunId(undefined)}
      >
        Show timer
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
      movable={compact}
      {...(compact || onDismiss
        ? {
            onDismiss: () => {
              if (compact) setDismissedRunId(projected.runId);
              onDismiss?.();
            },
          }
        : {})}
    />
  );
}
