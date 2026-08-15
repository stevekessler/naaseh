import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { CategoryRecord, Project, Task, TaskInput } from '@naaseh/domain';
import type { AssigneeOption } from '../../components/AssigneePicker.js';
import { TaskForm } from './TaskForm.js';

export function TaskEditDialog({
  task,
  categories,
  projects,
  assignees,
  parentTasks,
  save,
  close,
  secondaryContent,
}: {
  task: Task;
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  assignees: readonly AssigneeOption[];
  parentTasks: readonly Task[];
  save: (patch: Partial<Task>) => Promise<void>;
  close: () => void;
  secondaryContent?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const returnFocusId = useRef('');
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const dialog = ref.current;
    returnFocus.current = document.activeElement as HTMLElement | null;
    returnFocusId.current = returnFocus.current?.id ?? '';
    if (dialog && !dialog.open) dialog.showModal();
  }, []);
  const finishClose = () => {
    ref.current?.close();
    const target = returnFocus.current;
    close();
    // WebKit restores native-dialog focus in a later rendering step. Wait until
    // both that step and the parent unmount have committed before restoring the
    // invoking control.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        // Route/state updates may replace the invoking row, so prefer the
        // current DOM node over the element captured before the dialog opened.
        (
          document.getElementById(returnFocusId.current) ??
          document.getElementById(`task-edit-trigger-${task.id}`) ??
          target
        )?.focus();
      }),
    );
  };
  const requestClose = () => {
    if (dirty && !confirm('Discard unsaved task changes?')) return;
    finishClose();
  };
  return (
    <dialog
      ref={ref}
      className="task-edit-dialog"
      aria-labelledby="task-edit-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) requestClose();
      }}
    >
      <div onInput={() => setDirty(true)}>
        <header>
          <h2 id="task-edit-title">Edit task</h2>
          <button type="button" className="quiet" onClick={requestClose}>
            Cancel
          </button>
        </header>
        {error && <p role="alert">{error}</p>}
        <fieldset disabled={busy}>
          <TaskForm
            task={task}
            categories={categories}
            projects={projects}
            assignees={assignees}
            parentTasks={parentTasks}
            submitLabel={busy ? 'Saving…' : 'Save changes'}
            save={async (input: TaskInput) => {
              setBusy(true);
              setError('');
              try {
                const patch: Record<string, unknown> = { ...input };
                if (!input.dueKind && (task.dueKind || task.dueAt || task.dueDate)) {
                  patch.dueKind = null;
                  patch.dueDate = null;
                  patch.dueAt = null;
                  patch.dueTimeZone = null;
                }
                if (!input.parentId && task.parentId) patch.parentId = null;
                if (!input.groupId && task.groupId) patch.groupId = null;
                if (!input.postItColor && task.postItColor) patch.postItColor = null;
                await save(patch as Partial<Task>);
                setDirty(false);
                finishClose();
              } catch {
                setError('The task changed or could not be saved. Review it and try again.');
              } finally {
                setBusy(false);
              }
            }}
          />
        </fieldset>
        {secondaryContent}
      </div>
    </dialog>
  );
}
