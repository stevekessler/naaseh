import type { CategoryRecord, Project, Task, TaskRevision } from '@naaseh/domain';
import { TaskList } from './TaskList.js';
import { TaskActions } from './TaskActions.js';
import { SubtaskTree } from './SubtaskTree.js';
import { RevisionLog } from './RevisionLog.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';
import { TaskEditDialog } from './TaskEditDialog.js';
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
  currentUserId,
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
  currentUserId?: string;
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
      <TaskList
        tasks={tasks}
        onToggle={onToggle}
        onSelect={onSelect}
        {...(currentUserId ? { currentUserId } : {})}
      />
      {selected && (
        <>
          <TaskEditDialog
            task={selected}
            categories={categories}
            projects={projects}
            assignees={assignees}
            parentTasks={parentTasks}
            save={(patch) => onUpdate(selected, patch)}
            close={onClose}
            secondaryContent={
              <section
                className="task-detail-actions"
                aria-label="Task details"
                data-task-id={selected.id}
              >
                <TaskActions
                  task={selected}
                  csrfToken={csrfToken}
                  {...(currentUserId ? { currentUserId } : {})}
                  update={(patch) => void onUpdate(selected, patch)}
                />
                <h3>Subtasks</h3>
                <SubtaskTree parentId={selected.id} tasks={tasks} edit={onSelect} />
                <h3>Revision history</h3>
                <RevisionLog revisions={revisions} />
                <AttachmentPanelForParent
                  parentType="task"
                  parentId={selected.id}
                  csrfToken={csrfToken}
                />
              </section>
            }
          />
        </>
      )}
    </>
  );
}
