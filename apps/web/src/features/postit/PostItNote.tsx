import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UserAvatar } from '../profile/user-directory.js';
import { ProgressIndicator } from '../../components/ProgressIndicator.js';
import type { Task } from '@naaseh/domain';
import { resolvePostItPalette } from '../../styles/category-color.js';
import { formatDueValue, useBrowserTimeZone } from '../tasks/due-value.js';
import { LinkifiedText, MemoDocumentView } from '../memos/MemoDocumentView.js';
import { overdue } from '../../notifications/local-reminders.js';
import { CompactLink } from '../../components/CompactLink.js';
import { TaskTimerForTask } from '../timers/TaskTimerForTask.js';
import type { PostItFieldId } from './PostItFieldSettings.js';

export function PostItNote({
  task,
  color = '#fff2a8',
  animating = false,
  assigneeName,
  categoryName,
  currentUserId,
  complete,
  edit,
  visibleFields = new Set<PostItFieldId>([
    'due',
    'progress',
    'priority',
    'assignee',
    'category',
    'timer',
    'link',
    'memo',
  ]),
}: {
  task: Task;
  color?: string;
  animating?: boolean;
  assigneeName?: string | undefined;
  categoryName?: string | undefined;
  currentUserId?: string | undefined;
  complete: () => void;
  edit?: () => void;
  visibleFields?: ReadonlySet<PostItFieldId>;
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
        {edit ? (
          <button
            id={`task-edit-trigger-postit-${task.id}`}
            type="button"
            className="postit-title"
            onClick={edit}
          >
            {task.label}
          </button>
        ) : (
          task.label
        )}
        {task.visibility === 'private' && <span title="Private task"> 🔒</span>}
      </h2>
      {visibleFields.has('due') && (task.dueAt || task.dueDate) && (
        <small className="postit-due">
          {formatDueValue(task.dueAt, task.dueDate)}
          {overdue(task) && (
            <>
              {' '}
              · <span className="overdue-label">Overdue</span>
            </>
          )}
        </small>
      )}
      {(['progress', 'priority', 'assignee'] as const).some((field) => visibleFields.has(field)) ? (
        <div className="postit-meta">
          {visibleFields.has('progress') ? (
            <ProgressIndicator percent={task.percentComplete} label={task.label} />
          ) : null}
          {visibleFields.has('priority') ? (
            <UrgencyBadge urgency={task.urgency} mode="compact" />
          ) : null}
          {visibleFields.has('assignee') ? (
            <UserAvatar
              userId={task.assigneeId ?? task.ownerId}
              {...(assigneeName ? { displayName: assigneeName } : {})}
              showName
            />
          ) : null}
        </div>
      ) : null}
      {visibleFields.has('category') && categoryName ? (
        <span className="postit-category">{categoryName}</span>
      ) : null}
      {visibleFields.has('timer') && currentUserId ? (
        <TaskTimerForTask ownerId={currentUserId} task={task} compact />
      ) : null}
      {visibleFields.has('link') && task.link ? (
        <CompactLink className="postit-link" href={task.link} />
      ) : null}
      {edit ? (
        <button type="button" className="quiet" aria-label={`Edit ${task.label}`} onClick={edit}>
          Edit
        </button>
      ) : null}
      {visibleFields.has('memo') && task.memoHidden && (
        <span title="Private notes">🔒 Private notes</span>
      )}
      {visibleFields.has('memo') &&
        !task.memoHidden &&
        (task.memoDocument ? (
          <MemoDocumentView document={task.memoDocument} />
        ) : (
          task.memo && (
            <p>
              <LinkifiedText text={task.memo} />
            </p>
          )
        ))}
    </article>
  );
}
