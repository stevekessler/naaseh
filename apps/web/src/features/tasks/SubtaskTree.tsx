import type { Task } from '@naaseh/domain';
export function SubtaskTree({ parentId, tasks }: { parentId: string; tasks: Task[] }) {
  const children = tasks.filter((task) => task.parentId === parentId);
  return children.length ? (
    <ul>
      {children.map((child) => (
        <li key={child.id}>
          {child.label}
          <SubtaskTree parentId={child.id} tasks={tasks} />
        </li>
      ))}
    </ul>
  ) : null;
}
