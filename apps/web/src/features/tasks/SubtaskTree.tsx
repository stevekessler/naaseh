import type { Task } from '@naaseh/domain';
export function SubtaskTree({
  parentId,
  tasks,
  edit,
}: {
  parentId: string;
  tasks: Task[];
  edit?: (task: Task) => void;
}) {
  const children = tasks.filter((task) => task.parentId === parentId);
  return children.length ? (
    <ul>
      {children.map((child) => (
        <li key={child.id}>
          {edit ? (
            <button
              id={`task-edit-trigger-subtask-${child.id}`}
              type="button"
              className="quiet"
              onClick={() => edit(child)}
            >
              Edit {child.label}
            </button>
          ) : (
            child.label
          )}
          <SubtaskTree parentId={child.id} tasks={tasks} {...(edit ? { edit } : {})} />
        </li>
      ))}
    </ul>
  ) : null;
}
