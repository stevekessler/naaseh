import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { useState } from 'react';
import { TaskRow } from './TaskRow.js';
import type { TaskColumnId } from './TaskColumnSettings.js';
import { sortTasksForTable, type TaskListSort, type TaskListSortKey } from './task-list-sort.js';
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
const sortLabels: Record<TaskListSortKey, string> = {
  due: 'Due date',
  category: 'Category',
  project: 'Project',
  priority: 'Priority',
};

function SortableHeading({
  sortKey,
  sort,
  change,
  className,
}: {
  sortKey: TaskListSortKey;
  sort: TaskListSort | undefined;
  change: (key: TaskListSortKey) => void;
  className: string;
}) {
  const active = sort?.key === sortKey;
  const nextDirection = active && sort.direction === 'ascending' ? 'descending' : 'ascending';
  return (
    <th className={className} scope="col" aria-sort={active ? sort.direction : 'none'}>
      <button
        type="button"
        className="task-sort-button"
        aria-label={`Sort by ${sortLabels[sortKey]} ${nextDirection}`}
        onClick={() => change(sortKey)}
      >
        <span>{sortLabels[sortKey]}</span>
        <span aria-hidden="true">
          {active ? (sort.direction === 'ascending' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
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
  const [sort, setSort] = useState<TaskListSort>();
  const changeSort = (key: TaskListSortKey) =>
    setSort((current) => ({
      key,
      direction:
        current?.key === key && current.direction === 'ascending' ? 'descending' : 'ascending',
    }));
  const displayedTasks = sortTasksForTable(tasks, sort, categories, projects);
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
            <SortableHeading
              sortKey="category"
              sort={sort}
              change={changeSort}
              className="task-category-cell"
            />
            <SortableHeading
              sortKey="project"
              sort={sort}
              change={changeSort}
              className="task-project-cell"
            />
            <th className="task-memo-cell" scope="col">
              Memo
            </th>
            <th className="task-link-cell" scope="col">
              Link
            </th>
            <SortableHeading
              sortKey="due"
              sort={sort}
              change={changeSort}
              className="task-due-cell"
            />
            <SortableHeading
              sortKey="priority"
              sort={sort}
              change={changeSort}
              className="task-priority-cell"
            />
            <th className="task-assignee-cell" scope="col">
              Assignee
            </th>
            <th className="task-actions-heading" scope="col">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {displayedTasks.map((task) => {
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
