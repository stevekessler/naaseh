import type { Task } from '@naaseh/domain';
import { resolvePostItPalette } from '../../styles/category-color.js';
import { useBrowserTimeZone } from '../tasks/due-value.js';
import { MemoDocumentView } from '../memos/MemoDocumentView.js';

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
      <h2>{task.label}</h2>
      {edit ? (
        <button
          id={`task-edit-trigger-postit-${task.id}`}
          type="button"
          className="quiet"
          onClick={edit}
        >
          Edit {task.label}
        </button>
      ) : null}
      {!task.memoHidden &&
        (task.memoDocument ? (
          <MemoDocumentView document={task.memoDocument} />
        ) : (
          task.memo && <p>{task.memo}</p>
        ))}
      {(task.dueAt || task.dueDate) && (
        <small>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : task.dueDate}</small>
      )}
    </article>
  );
}
