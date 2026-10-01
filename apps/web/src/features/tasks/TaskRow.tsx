import { UserAvatar } from '../profile/user-directory.js';
import type { Task } from '@naaseh/domain';
import { ReminderStatus } from '../reminders/ReminderStatus.js';
import { useCompletionFeedback } from './useCompletionFeedback.js';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { formatDueValue, useBrowserTimeZone } from './due-value.js';
import { LinkifiedText, MemoDocumentView } from '../memos/MemoDocumentView.js';
import { TaskTimerForTask } from '../timers/TaskTimerForTask.js';
import { ProgressIndicator } from '../../components/ProgressIndicator.js';
import { CompactLink } from '../../components/CompactLink.js';
export function TaskRow({
  task,
  onToggle,
  onSelect,
  onProgressChange,
  currentUserId,
  categoryName,
  projectName,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onProgressChange: (task: Task, percent: number) => void | Promise<void>;
  currentUserId?: string;
  categoryName?: string | undefined;
  projectName?: string | undefined;
}) {
  const feedback = useCompletionFeedback();
  useBrowserTimeZone();
  const dueLabel = formatDueValue(task.dueAt, task.dueDate);
  return (
    <tr className={task.status === 'completed' ? 'done' : ''}>
      <td className="task-status-cell">
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
        <span className="visually-hidden" role="status" aria-live="polite">
          {feedback.announcement}
        </span>
      </td>
      <th className="task-name-cell" scope="row">
        <h2>
          <button
            id={`task-edit-trigger-${task.id}`}
            className="task-link"
            onClick={() => onSelect(task)}
          >
            {task.label}
          </button>
        </h2>
        {task.visibility === 'private' && <span title="Private">🔒</span>}
        <ProgressIndicator
          percent={task.percentComplete}
          label={task.label}
          onChange={(percent) => onProgressChange(task, percent)}
        />
      </th>
      <td className="task-project-cell">{projectName || <span aria-hidden="true">—</span>}</td>
      <td className="task-category-cell">{categoryName || <span aria-hidden="true">—</span>}</td>
      <td className="task-memo-cell">
        <div className="task-row-memo">
          {task.memoHidden ? (
            <span className="muted">🔒 Private memo</span>
          ) : task.memoDocument ? (
            <MemoDocumentView document={task.memoDocument} />
          ) : task.memo ? (
            <p>
              <LinkifiedText text={task.memo} />
            </p>
          ) : (
            <span aria-hidden="true">—</span>
          )}
        </div>
      </td>
      <td className="task-link-cell">
        {task.link ? <CompactLink href={task.link} /> : <span aria-hidden="true">—</span>}
      </td>
      <td className="task-due-cell">
        {dueLabel ? <small>{dueLabel}</small> : <span aria-hidden="true">—</span>}
        <ReminderStatus task={task} />
      </td>
      <td className="task-priority-cell">
        <UrgencyBadge urgency={task.urgency} mode="responsive" />
      </td>
      <td className="task-assignee-cell">
        <UserAvatar userId={task.assigneeId ?? task.ownerId} showName />
      </td>
      <td className="task-actions-cell">
        <details className="task-row-actions-menu">
          <summary role="button" aria-label={`Actions for ${task.label}`}>
            Actions
          </summary>
          <div>
            <button type="button" className="quiet task-edit-button" onClick={() => onSelect(task)}>
              Edit
            </button>
            {currentUserId ? (
              <TaskTimerForTask ownerId={currentUserId} task={task} compact />
            ) : null}
          </div>
        </details>
      </td>
    </tr>
  );
}
