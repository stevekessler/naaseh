import type { CategoryRecord, Project, Task, TaskRevision } from '@naaseh/domain';
import { TaskList } from './TaskList.js';
import { TaskForm } from './TaskForm.js';
import { TaskActions } from './TaskActions.js';
import { SubtaskTree } from './SubtaskTree.js';
import { RevisionLog } from './RevisionLog.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';
export function TaskListPage({
  tasks,
  loading = false,
  error,
  selected,
  revisions = [],
  onToggle,
  onSelect,
  onClose,
  onUpdate,
  csrfToken,
  categories = [],
  projects = [],
  assignees = [],
  parentTasks = tasks,
  defaultAssigneeId,
}: {
  tasks: Task[];
  loading?: boolean;
  error?: string;
  selected?: Task | undefined;
  revisions?: TaskRevision[];
  onToggle: (task: Task) => void;
  onSelect: (task: Task) => void;
  onClose: () => void;
  onUpdate: (task: Task, patch: Partial<Task>) => Promise<void>;
  csrfToken: string;
  categories?: CategoryRecord[];
  projects?: Project[];
  assignees?: AssigneeOption[];
  parentTasks?: Task[];
  defaultAssigneeId?: string;
}) {
  if (loading) return <p role="status">Loading tasks…</p>;
  if (error)
    return (
      <div role="alert">
        <p>Tasks could not be loaded.</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    );
  return (
    <>
      <TaskList tasks={tasks} onToggle={onToggle} onSelect={onSelect} />
      {selected && (
        <aside className="task-detail" aria-label="Task details" data-task-id={selected.id}>
          <button className="quiet" onClick={onClose}>
            Close details
          </button>
          <h2>{selected.label}</h2>
          <TaskActions
            task={selected}
            csrfToken={csrfToken}
            update={(patch) => void onUpdate(selected, patch)}
          />
          <TaskForm
            task={selected}
            categories={categories}
            projects={projects}
            assignees={assignees}
            parentTasks={parentTasks}
            {...(defaultAssigneeId ? { defaultAssigneeId } : {})}
            submitLabel="Save changes"
            save={(patch) => onUpdate(selected, patch as Partial<Task>)}
          />
          <h3>Subtasks</h3>
          <SubtaskTree parentId={selected.id} tasks={tasks} />
          <h3>Revision history</h3>
          <RevisionLog revisions={revisions} />
          <AttachmentPanelForParent
            parentType="task"
            parentId={selected.id}
            csrfToken={csrfToken}
          />
        </aside>
      )}
    </>
  );
}
