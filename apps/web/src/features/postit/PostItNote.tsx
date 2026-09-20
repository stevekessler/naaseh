import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UserAvatar } from '../profile/user-directory.js';
import type { Task } from '@naaseh/domain';
import { resolvePostItPalette } from '../../styles/category-color.js';
import { useBrowserTimeZone } from '../tasks/due-value.js';
import { MemoDocumentView } from '../memos/MemoDocumentView.js';
import { overdue } from '../../notifications/local-reminders.js';

export function PostItNote({
  task,
  color = '#fff2a8',
  animating = false,
  complete,
  edit,
}: {
  task: Task;
  color?: string;
  animating?: boolean;
  complete: () => void;
  edit?: () => void;
}) {
  const completed = task.status === 'completed';
  useBrowserTimeZone();
  const palette = resolvePostItPalette(task, color);
  return (
    <article
      className={`postit ${completed || animating ? 'crumpled' : ''}`}
      style={{ background: palette.background, color: palette.foreground }}
      data-task-id={task.id}
      data-post-it-color={task.postItColor ?? (color === '#fff2a8' ? 'yellow' : 'category')}
    >
      <button
        className="check"
        onClick={complete}
        aria-label={`${completed ? 'Reopen' : 'Complete'} ${task.label}`}
      >
        {completed ? '✓' : ''}
      </button>
      <h2>
        {task.label}
        {task.visibility === 'private' && <span title="Private task"> 🔒</span>}
      </h2>
      {(task.dueAt || task.dueDate) && (
        <small className="postit-due">
          {task.dueAt
            ? new Date(task.dueAt).toLocaleString(undefined, {
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                ...(overdue(task) ? { hour: 'numeric', minute: '2-digit' } : {}),
              })
            : task.dueDate}
          {overdue(task) && (
            <>
              {' '}
              · <span className="overdue-label">Overdue</span>
            </>
          )}
        </small>
      )}
      <div className="postit-meta">
        <UrgencyBadge urgency={task.urgency} mode="compact" />
        <UserAvatar userId={task.assigneeId ?? task.ownerId} />
      </div>
      {edit ? (
        <button
          id={`task-edit-trigger-postit-${task.id}`}
          type="button"
          className="quiet"
          aria-label={`Edit ${task.label}`}
          onClick={edit}
        >
          Edit
        </button>
      ) : null}
      {task.memoHidden && <span title="Private notes">🔒 Private notes</span>}
      {!task.memoHidden &&
        (task.memoDocument ? (
          <MemoDocumentView document={task.memoDocument} />
        ) : (
          task.memo && <p>{task.memo}</p>
        ))}
    </article>
  );
}
