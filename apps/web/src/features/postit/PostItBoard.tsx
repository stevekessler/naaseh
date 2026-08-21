import { useState } from 'react';
import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { PostItNote } from './PostItNote.js';
import { usePostItCompletion } from './usePostItCompletion.js';
import { TaskEditDialog } from '../tasks/TaskEditDialog.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';

export function PostItBoard({
  tasks,
  categories = [],
  projects = [],
  assignees = [],
  onToggle,
  onUpdate,
}: {
  tasks: Task[];
  categories?: CategoryRecord[];
  projects?: Project[];
  assignees?: AssigneeOption[];
  onToggle: (task: Task) => Promise<void>;
  onUpdate?: (task: Task, patch: Partial<Task>) => Promise<void>;
}) {
  const { completing, announcement, complete } = usePostItCompletion(onToggle);
  const [editingId, setEditingId] = useState<string>();
  const editing = tasks.find((task) => task.id === editingId);
  const colors = new Map(categories.map((category) => [category.id, category.color]));
  return (
    <>
      <p className="visually-hidden" role="status" aria-live="polite">
        {announcement}
      </p>
      <div className="postit-board">
        {tasks.map((task) => (
          <PostItNote
            key={task.id}
            task={task}
            {...(task.categoryId && colors.get(task.categoryId)
              ? { color: colors.get(task.categoryId)! }
              : {})}
            animating={completing === task.id}
            complete={() => void complete(task)}
            {...(onUpdate ? { edit: () => setEditingId(task.id) } : {})}
          />
        ))}
      </div>
      {editing && onUpdate ? (
        <TaskEditDialog
          task={editing}
          categories={categories}
          projects={projects}
          assignees={assignees}
          parentTasks={tasks}
          save={(patch) => onUpdate(editing, patch)}
          close={() => setEditingId(undefined)}
        />
      ) : null}
    </>
  );
}
