import type { Task } from '@naaseh/domain';
import { TaskRow } from './TaskRow.js';
export function TaskList({
  tasks,
  onToggle,
  onSelect = () => {},
}: {
  tasks: Task[];
  onToggle: (task: Task) => void;
  onSelect?: (task: Task) => void;
}) {
  if (!tasks.length)
    return (
      <div className="empty">
        <h2>Your list is clear.</h2>
        <p>Add a task above, or adjust your filters.</p>
      </div>
    );
  return (
    <ul className="task-list">
      {tasks.map((task) => (
        <TaskRow key={task.id} task={task} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </ul>
  );
}
