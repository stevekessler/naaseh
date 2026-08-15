import type { Task } from '@naaseh/domain';
import { ReminderStatus } from '../reminders/ReminderStatus.js';
import { useCompletionFeedback } from './useCompletionFeedback.js';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { useBrowserTimeZone } from './due-value.js';
import { MemoDocumentView } from '../memos/MemoDocumentView.js';
import { TaskTimerForTask } from '../timers/TaskTimerForTask.js';
export function TaskRow({
  task,
  onToggle,
  onSelect,
  currentUserId,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  currentUserId?: string;
}) {
  const feedback = useCompletionFeedback();
  useBrowserTimeZone();
  return (
    <li className={task.status === 'completed' ? 'done' : ''}>
      <button
        className="check"
        aria-label={`${task.status === 'completed' ? 'Reopen' : 'Complete'} ${task.label}`}
        onClick={() => {
          feedback.complete(task.label, task.status !== 'completed');
          onToggle(task);
        }}
      >
        {task.status === 'completed' ? '✓' : ''}
      </button>
      <div>
        <h2>
          <button
            id={`task-edit-trigger-${task.id}`}
            className="task-link"
            onClick={() => onSelect(task)}
          >
            {task.label}
          </button>
        </h2>
        {!task.memoHidden &&
          (task.memoDocument ? (
            <MemoDocumentView document={task.memoDocument} />
          ) : (
            task.memo && <p>{task.memo}</p>
          ))}
        <small>
          {task.dueAt
            ? `Due ${new Date(task.dueAt).toLocaleString()} · `
            : task.dueDate
              ? `Due ${task.dueDate} · `
              : ''}
          revision {task.version}
        </small>{' '}
        <ReminderStatus task={task} />
        <UrgencyBadge urgency={task.urgency} />
      </div>
      {task.visibility === 'private' && <span title="Private">🔒</span>}
      {currentUserId ? <TaskTimerForTask ownerId={currentUserId} task={task} /> : null}
      <span className="visually-hidden" role="status" aria-live="polite">
        {feedback.announcement}
      </span>
    </li>
  );
}
