import type { Task } from '@naaseh/domain';
import { ReminderStatus } from '../reminders/ReminderStatus.js';
import { useCompletionFeedback } from './useCompletionFeedback.js';
export function TaskRow({
  task,
  onToggle,
  onSelect,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
}) {
  const feedback = useCompletionFeedback();
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
        <button className="task-link" onClick={() => onSelect(task)}>
          <h2>{task.label}</h2>
        </button>
        {task.memo && !task.memoHidden && <p>{task.memo}</p>}
        <small>
          {task.dueAt ? `Due ${new Date(task.dueAt).toLocaleString()}` : 'No due date'} · revision{' '}
          {task.version}
        </small>{' '}
        <ReminderStatus task={task} />
      </div>
      {task.visibility === 'private' && <span title="Private">🔒</span>}
      <span className="visually-hidden" role="status" aria-live="polite">
        {feedback.announcement}
      </span>
    </li>
  );
}
