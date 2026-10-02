import type { CSSProperties } from 'react';
import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { TaskRow } from './TaskRow.js';
import type { TaskColumnId } from './TaskColumnSettings.js';
const configurableColumns: TaskColumnId[] = [
  'category',
  'project',
  'memo',
  'link',
  'due',
  'priority',
  'assignee',
  'actions',
];
export function TaskList({
  tasks,
  onToggle,
  onSelect = () => {},
  onProgressChange,
  currentUserId,
  categories = [],
  projects = [],
  visibleColumns,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
  onProgressChange: (task: Task, percent: number) => void | Promise<void>;
  currentUserId?: string;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  visibleColumns: ReadonlySet<TaskColumnId>;
}) {
  if (!tasks.length)
    return (
      <div className="empty">
        <h2>Your list is clear.</h2>
        <p>Add a task above, or adjust your filters.</p>
      </div>
    );
  return (
    <div className="task-table-wrap">
      <table
        className={`task-list ${configurableColumns
          .filter((column) => !visibleColumns.has(column))
          .map((column) => `hide-${column}`)
          .join(' ')}`}
        aria-label="Tasks"
        style={{ '--task-visible-columns': visibleColumns.size + 2 } as CSSProperties}
      >
        <colgroup>
          <col className="task-status-column" />
          <col className="task-name-column" />
          <col className="task-category-column" />
          <col className="task-project-column" />
          <col className="task-memo-column" />
          <col className="task-link-column" />
          <col className="task-due-column" />
          <col className="task-priority-column" />
          <col className="task-assignee-column" />
          <col className="task-actions-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Status</span>
            </th>
            <th scope="col">Task</th>
            <th className="task-category-cell" scope="col">
              Category
            </th>
            <th className="task-project-cell" scope="col">
              Project
            </th>
            <th className="task-memo-cell" scope="col">
              Memo
            </th>
            <th className="task-link-cell" scope="col">
              Link
            </th>
            <th className="task-due-cell" scope="col">
              Due
            </th>
            <th className="task-priority-cell" scope="col">
              <span className="visually-hidden">Priority</span>
            </th>
            <th className="task-assignee-cell" scope="col">
              Assignee
            </th>
            <th className="task-actions-heading" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const project = projects.find((candidate) => candidate.id === task.projectId);
            const categoryId = task.categoryId ?? project?.categoryId;
            return (
              <TaskRow
                key={task.id}
                task={task}
                onToggle={onToggle}
                onSelect={onSelect}
                onProgressChange={onProgressChange}
                categoryName={categories.find((category) => category.id === categoryId)?.name}
                categoryColor={categories.find((category) => category.id === categoryId)?.color}
                projectName={project?.name}
                {...(currentUserId ? { currentUserId } : {})}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
