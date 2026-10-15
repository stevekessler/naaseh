import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { UserAvatar } from '../profile/user-directory.js';
import { instantToLocalDue, localDueToInstant, type Task } from '@naaseh/domain';
import { ReminderStatus } from '../reminders/ReminderStatus.js';
import { useCompletionFeedback } from './useCompletionFeedback.js';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { formatDueValue, useBrowserTimeZone } from './due-value.js';
import { LinkifiedText, MemoDocumentView } from '../memos/MemoDocumentView.js';
import { TaskTimerForTask } from '../timers/TaskTimerForTask.js';
import { ProgressIndicator } from '../../components/ProgressIndicator.js';
import { CompactLink } from '../../components/CompactLink.js';
import { categoryForeground } from '../../styles/category-color.js';
import { DueDateDialog, type DueDateValue } from './DueDateField.js';

export function taskDueDatePatch(task: Task, value: DueDateValue): Partial<Task> {
  let patch: Record<string, unknown>;
  if (value.dueKind === 'timed') {
    patch = {
      dueKind: 'timed',
      dueAt: localDueToInstant(value.dueDate, value.dueTime).dueAt,
      ...(task.dueDate ? { dueDate: null } : {}),
    };
  } else if (value.dueKind === 'date') {
    patch = {
      dueKind: 'date',
      dueDate: value.dueDate,
      ...(task.dueAt ? { dueAt: null } : {}),
      ...(task.dueTimeZone ? { dueTimeZone: null } : {}),
    };
  } else {
    patch = {
      dueKind: null,
      dueDate: null,
      dueAt: null,
      dueTimeZone: null,
    };
  }
  return patch as Partial<Task>;
}

export function TaskRow({
  task,
  onToggle,
  onSelect,
  onDueDateChange,
  onProgressChange,
  currentUserId,
  categoryName,
  categoryColor,
  projectName,
  groupName,
  parentTask,
}: {
  task: Task;
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onDueDateChange?: (task: Task, patch: Partial<Task>) => void | Promise<void>;
  onProgressChange: (task: Task, percent: number) => void | Promise<void>;
  currentUserId?: string;
  categoryName?: string | undefined;
  categoryColor?: string | undefined;
  projectName?: string | undefined;
  groupName?: string | undefined;
  parentTask?: Task | undefined;
}) {
  const feedback = useCompletionFeedback();
  useBrowserTimeZone();
  const dueLabel = formatDueValue(task.dueAt, task.dueDate);
  const timedDue = task.dueAt ? instantToLocalDue(task.dueAt) : undefined;
  const dueValue: DueDateValue = {
    dueKind: task.dueKind ?? (task.dueDate ? 'date' : task.dueAt ? 'timed' : 'none'),
    dueDate: task.dueDate ?? timedDue?.localDate ?? '',
    dueTime: timedDue?.localTime ?? '10:00',
  };
  const [editingDueDate, setEditingDueDate] = useState(false);
  const actions = useRef<HTMLDetailsElement>(null);
  const categoryPalette = categoryForeground(categoryColor ?? '#fff2a8');
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      const target = event.target as Element;
      if (target.closest('.task-timer--movable')) return;
      if (actions.current?.open && !actions.current.contains(target)) actions.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);
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
        {parentTask ? (
          <p className="task-parent-label">
            <span>Subtask of </span>
            <button
              type="button"
              className="task-parent-link"
              aria-label={`Open parent task ${parentTask.label}`}
              onClick={() => onSelect(parentTask)}
            >
              {parentTask.label}
            </button>
          </p>
        ) : null}
      </th>
      <td className="task-category-cell">
        {categoryName ? (
          <span
            className="task-category-chip"
            style={
              {
                '--category-background': categoryPalette.background,
                '--category-foreground': categoryPalette.foreground,
              } as CSSProperties
            }
          >
            {categoryName}
          </span>
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </td>
      <td className="task-project-cell">{projectName || <span aria-hidden="true">—</span>}</td>
      <td className="task-group-cell">{groupName || <span aria-hidden="true">—</span>}</td>
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
        {onDueDateChange ? (
          <button
            type="button"
            className="quiet task-due-trigger"
            aria-label={`${dueLabel ? 'Edit' : 'Add'} due date for ${task.label}${dueLabel ? `, currently ${dueLabel}` : ''}`}
            onClick={() => setEditingDueDate(true)}
          >
            {dueLabel || <span aria-hidden="true">—</span>}
          </button>
        ) : dueLabel ? (
          <span>{dueLabel}</span>
        ) : (
          <span aria-hidden="true">—</span>
        )}
        {editingDueDate && onDueDateChange ? (
          <DueDateDialog
            value={dueValue}
            onChange={(value) => onDueDateChange(task, taskDueDatePatch(task, value))}
            onClose={() => setEditingDueDate(false)}
          />
        ) : null}
        {task.repeatInterval && task.repeatUnit ? (
          <small>
            Repeats every {task.repeatInterval} {task.repeatUnit}
            {task.repeatInterval === 1 ? '' : 's'}
          </small>
        ) : null}
        <ReminderStatus task={task} />
      </td>
      <td className="task-priority-cell">
        <UrgencyBadge urgency={task.urgency} mode="responsive" />
      </td>
      <td className="task-assignee-cell">
        <UserAvatar userId={task.assigneeId ?? task.ownerId} showName nameFormat="first" />
      </td>
      <td className="task-actions-cell">
        <details
          ref={actions}
          className="task-row-actions-menu"
          onToggle={(event) => {
            if (!event.currentTarget.open) return;
            const details = event.currentTarget;
            requestAnimationFrame(() =>
              details.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
            );
          }}
        >
          <summary role="button" aria-label={`Actions for ${task.label}`}>
            Actions
          </summary>
          <div>
            <button type="button" className="quiet task-edit-button" onClick={() => onSelect(task)}>
              Edit
            </button>
            {currentUserId ? (
              <TaskTimerForTask
                ownerId={currentUserId}
                task={task}
                compact
                onDismiss={() => {
                  if (actions.current) actions.current.open = false;
                }}
              />
            ) : null}
          </div>
        </details>
      </td>
    </tr>
  );
}
