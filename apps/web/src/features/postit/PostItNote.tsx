import type { Task } from '@naaseh/domain';
import { categoryForeground } from '../../styles/category-color.js';

export function PostItNote({
  task,
  color = '#fff2a8',
  animating = false,
  complete,
}: {
  task: Task;
  color?: string;
  animating?: boolean;
  complete: () => void;
}) {
  const completed = task.status === 'completed';
  const palette = categoryForeground(color);
  return (
    <article
      className={`postit ${completed || animating ? 'crumpled' : ''}`}
      style={{ background: palette.background, color: palette.foreground }}
      data-task-id={task.id}
    >
      <button
        className="check"
        onClick={complete}
        aria-label={`${completed ? 'Reopen' : 'Complete'} ${task.label}`}
      >
        {completed ? '✓' : ''}
      </button>
      <h2>{task.label}</h2>
      {task.memo && !task.memoHidden && <p>{task.memo}</p>}
      <small>{task.dueAt ? new Date(task.dueAt).toLocaleDateString() : 'Someday'}</small>
    </article>
  );
}
