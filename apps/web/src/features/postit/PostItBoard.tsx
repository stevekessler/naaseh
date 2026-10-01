import { useState } from 'react';
import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { PostItNote } from './PostItNote.js';
import { usePostItCompletion } from './usePostItCompletion.js';
import { TaskEditDialog } from '../tasks/TaskEditDialog.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';
import { AttachmentPanelForParent } from '../attachments/AttachmentPanelForParent.js';

export function PostItBoard({
  tasks,
  categories = [],
  projects = [],
  assignees = [],
  parentTasks = tasks,
  onToggle,
  onUpdate,
  currentUserId,
  csrfToken,
}: {
  tasks: Task[];
  categories?: CategoryRecord[];
  projects?: Project[];
  assignees?: AssigneeOption[];
  parentTasks?: Task[];
  onToggle: (task: Task) => Promise<void>;
  onUpdate?: (task: Task, patch: Partial<Task>) => Promise<void>;
  currentUserId?: string;
  csrfToken?: string;
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
        {tasks.map((task) => {
          const project = projects.find((candidate) => candidate.id === task.projectId);
          const categoryId = task.categoryId ?? project?.categoryId;
          return (
            <PostItNote
              key={task.id}
              task={task}
              {...(task.categoryId && colors.get(task.categoryId)
                ? { color: colors.get(task.categoryId)! }
                : {})}
              animating={completing === task.id}
              assigneeName={
                assignees.find((assignee) => assignee.id === (task.assigneeId ?? task.ownerId))
                  ?.displayName
              }
              categoryName={categories.find((category) => category.id === categoryId)?.name}
              complete={() => void complete(task)}
              {...(currentUserId ? { currentUserId } : {})}
              {...(onUpdate ? { edit: () => setEditingId(task.id) } : {})}
            />
          );
        })}
      </div>
      {editing && onUpdate ? (
        <TaskEditDialog
          task={editing}
          categories={categories}
          projects={projects}
          assignees={assignees}
          parentTasks={parentTasks}
          save={(patch) => onUpdate(editing, patch)}
          close={() => setEditingId(undefined)}
          primaryContent={
            csrfToken ? (
              <AttachmentPanelForParent
                parentType="task"
                parentId={editing.id}
                csrfToken={csrfToken}
              />
            ) : undefined
          }
        />
      ) : null}
    </>
  );
}
