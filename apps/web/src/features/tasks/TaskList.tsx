import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { TaskRow } from './TaskRow.js';
export function TaskList({
  tasks,
  onToggle,
  onSelect = () => {},
  onProgressChange,
  currentUserId,
  categories = [],
  projects = [],
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
  onProgressChange: (task: Task, percent: number) => void | Promise<void>;
  currentUserId?: string;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
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
      <table className="task-list" aria-label="Tasks">
        <colgroup>
          <col className="task-status-column" />
          <col className="task-name-column" />
          <col className="task-project-column" />
          <col className="task-category-column" />
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
            <th scope="col">Project</th>
            <th scope="col">Category</th>
            <th scope="col">Memo</th>
            <th scope="col">Link</th>
            <th scope="col">Due</th>
            <th scope="col">
              <span className="visually-hidden">Priority</span>
            </th>
            <th scope="col">Assignee</th>
            <th scope="col">Actions</th>
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
