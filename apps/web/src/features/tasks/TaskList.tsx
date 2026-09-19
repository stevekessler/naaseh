import type { Task } from '@naaseh/domain';
import { TaskRow } from './TaskRow.js';
export function TaskList({
  tasks,
  onToggle,
  onSelect = () => {},
  currentUserId,
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
  currentUserId?: string;
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
          <col className="task-memo-column" />
          <col className="task-due-column" />
          <col className="task-priority-column" />
          <col className="task-assignee-column" />
          <col className="task-timer-column" />
        </colgroup>
        <thead>
          <tr>
            <th scope="col">
              <span className="visually-hidden">Status</span>
            </th>
            <th scope="col">Task</th>
            <th scope="col">Memo</th>
            <th scope="col">Due</th>
            <th scope="col">Priority</th>
            <th scope="col">Assignee</th>
            <th scope="col">Timer</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onSelect={onSelect}
              {...(currentUserId ? { currentUserId } : {})}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
