import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { TaskRow } from './TaskRow.js';
import { TaskTableSettings, type TaskColumnId } from './TaskColumnSettings.js';
import {
  loadTaskListSort,
  resetTaskListSort,
  saveTaskListSort,
  sortTasksForTable,
  type TaskListSort,
  type TaskListSortKey,
} from './task-list-sort.js';
import { taskDueDateKey } from '../../search/task-filters.js';
const configurableColumns: TaskColumnId[] = [
  'category',
  'project',
  'group',
  'memo',
  'link',
  'due',
  'priority',
  'assignee',
  'actions',
];
const sortLabels: Record<TaskListSortKey, string> = {
  name: 'Task name',
  due: 'Due date',
  category: 'Category',
  project: 'Project',
  priority: 'Priority',
};

const mobileSortOptions = [
  { key: 'name', direction: 'ascending', label: 'Task name (A to Z)' },
  { key: 'name', direction: 'descending', label: 'Task name (Z to A)' },
  { key: 'due', direction: 'ascending', label: 'Due date (earliest first)' },
  { key: 'due', direction: 'descending', label: 'Due date (latest first)' },
  { key: 'priority', direction: 'descending', label: 'Priority (highest first)' },
  { key: 'priority', direction: 'ascending', label: 'Priority (lowest first)' },
] as const;

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
  onUpdate,
  onProgressChange,
  currentUserId,
  categories = [],
  projects = [],
  groups = [],
  relationshipTasks = tasks,
  visibleColumns,
  columnSettings,
  collapseFutureTasks = false,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
  onUpdate?: (task: Task, patch: Partial<Task>) => void | Promise<void>;
  onProgressChange: (task: Task, percent: number) => void | Promise<void>;
  currentUserId?: string;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  groups?: readonly { id: string; name: string }[];
  relationshipTasks?: readonly Task[];
  visibleColumns: ReadonlySet<TaskColumnId>;
  columnSettings?: ReactNode;
  collapseFutureTasks?: boolean;
}) {
  const sortGroupName = useId();
  const [sort, setSort] = useState<TaskListSort>();
  const [showAllFutureTasks, setShowAllFutureTasks] = useState(false);
  useEffect(() => {
    let active = true;
    void loadTaskListSort()
      .then((stored) => {
        if (active) setSort(stored);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  const applySort = (next: TaskListSort) => {
    setSort(next);
    void saveTaskListSort(next).catch(() => undefined);
  };
  const resetSort = () => {
    setSort(undefined);
    void resetTaskListSort().catch(() => undefined);
  };
  const changeSort = (key: TaskListSortKey) => {
    applySort({
      key,
      direction: sort?.key === key && sort.direction === 'ascending' ? 'descending' : 'ascending',
    });
  };
  const sortedTasks = sortTasksForTable(tasks, sort, categories, projects);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  const cutoffDay = cutoff.getDate();
  cutoff.setDate(1);
  cutoff.setMonth(cutoff.getMonth() + 3);
  cutoff.setDate(
    Math.min(cutoffDay, new Date(cutoff.getFullYear(), cutoff.getMonth() + 1, 0).getDate()),
  );
  const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
  const hiddenFutureTasks = collapseFutureTasks
    ? sortedTasks.filter((task) => {
        const dueDate = taskDueDateKey(task);
        return Boolean(dueDate && dueDate > cutoffKey);
      })
    : [];
  const hiddenFutureTaskIds = new Set(hiddenFutureTasks.map((task) => task.id));
  const displayedTasks =
    collapseFutureTasks && !showAllFutureTasks
      ? sortedTasks.filter((task) => !hiddenFutureTaskIds.has(task.id))
      : sortedTasks;
  const toolbar = columnSettings ? (
    <div className="task-list-toolbar">
      <p>
        {tasks.length} task{tasks.length === 1 ? '' : 's'}
      </p>
      <div className="task-list-toolbar-controls">
        {tasks.length > 0 && (
          <TaskTableSettings
            className="task-mobile-sort"
            label="Sort"
            title="Sort tasks"
            closeLabel="Close sort settings"
          >
            <p>Choose the order of the task list.</p>
            <div className="task-column-options">
              <label>
                <input type="radio" name={sortGroupName} checked={!sort} onChange={resetSort} />
                Automatic
              </label>
              {mobileSortOptions.map(({ key, direction, label }) => (
                <label key={label}>
                  <input
                    type="radio"
                    name={sortGroupName}
                    checked={sort?.key === key && sort.direction === direction}
                    onChange={() => applySort({ key, direction })}
                  />
                  {label}
                </label>
              ))}
              {sort?.key === 'category' || sort?.key === 'project' ? (
                <label>
                  <input type="radio" name={sortGroupName} checked readOnly />
                  {sortLabels[sort.key]} ({sort.direction})
                </label>
              ) : null}
            </div>
          </TaskTableSettings>
        )}
        {columnSettings}
      </div>
    </div>
  ) : null;
  if (!tasks.length)
    return (
      <>
        {toolbar}
        <div className="empty">
          <h2>Your list is clear.</h2>
          <p>Add a task above, or adjust your filters.</p>
        </div>
      </>
    );
  const table = (
    <div className="task-table-wrap">
      {sort ? (
        <div className="task-sort-toolbar" role="status">
          <span>
            Sorted by {sortLabels[sort.key]} {sort.direction}
          </span>
          <button type="button" className="quiet" onClick={resetSort}>
            Reset sort
          </button>
        </div>
      ) : null}
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
          <col className="task-group-column" />
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
            <th className="task-group-cell" scope="col">
              Group
            </th>
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
                {...(onUpdate ? { onUpdate } : {})}
                onProgressChange={onProgressChange}
                categoryName={categories.find((category) => category.id === categoryId)?.name}
                categoryColor={categories.find((category) => category.id === categoryId)?.color}
                projectName={project?.name}
                groupName={groups.find((group) => group.id === task.groupId)?.name}
                parentTask={relationshipTasks.find((candidate) => candidate.id === task.parentId)}
                {...(currentUserId ? { currentUserId } : {})}
              />
            );
          })}
        </tbody>
      </table>
      {hiddenFutureTasks.length ? (
        <div className="task-list-more">
          <button
            type="button"
            className="quiet"
            aria-expanded={showAllFutureTasks}
            onClick={() => setShowAllFutureTasks((current) => !current)}
          >
            {showAllFutureTasks
              ? 'Show fewer tasks'
              : `View ${hiddenFutureTasks.length} more task${hiddenFutureTasks.length === 1 ? '' : 's'}`}
          </button>
          {!showAllFutureTasks ? (
            <span>Tasks due more than three months from now are hidden.</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
  return (
    <>
      {toolbar}
      {table}
    </>
  );
}
