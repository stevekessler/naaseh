import { type FormEvent, useState } from 'react';
import {
  defaultUrgency,
  type CategoryRecord,
  type Project,
  type Task,
  type TaskInput,
  type Urgency,
} from '@naaseh/domain';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { UrgencyField } from '../../components/UrgencyField.js';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
export function TaskForm({
  save,
  task,
  categories = [],
  projects = [],
  assignees = [],
  parentTasks = [],
  defaultAssigneeId,
  submitLabel = task ? 'Save changes' : 'Add task',
}: {
  save: (task: TaskInput) => Promise<void>;
  task?: Task;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  assignees?: readonly AssigneeOption[];
  parentTasks?: readonly Task[];
  defaultAssigneeId?: string;
  submitLabel?: string;
}) {
  const [urgency, setUrgency] = useState<Urgency>(task?.urgency ?? defaultUrgency);
  const initialCategoryId =
    task?.categoryId ??
    projects.find((project) => project.id === task?.projectId)?.categoryId ??
    '';
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [projectId, setProjectId] = useState(task?.projectId ?? '');
  const openParentTasks = parentTasks
    .filter(
      (candidate) =>
        candidate.id !== task?.id &&
        candidate.status === 'open' &&
        (candidate.lifecycle ?? 'active') === 'active' &&
        candidate.completionState !== 'completed',
    )
    .sort((left, right) => left.label.localeCompare(right.label));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const due = value('dueAt');
    const submittedProjectId = value('projectId');
    const submittedCategoryId =
      projects.find((item) => item.id === submittedProjectId)?.categoryId || value('categoryId');
    const category = categories.find((item) => item.id === submittedCategoryId);
    const assigneeId =
      value('assigneeId') || category?.defaultAssigneeId || (!task ? defaultAssigneeId : undefined);
    await save({
      label: value('label'),
      memo: value('memo'),
      link: value('link'),
      ...(due
        ? {
            dueAt: new Date(due).toISOString(),
            dueTimeZone: value('dueTimeZone') || Intl.DateTimeFormat().resolvedOptions().timeZone,
          }
        : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(submittedCategoryId ? { categoryId: submittedCategoryId } : {}),
      ...(submittedProjectId ? { projectId: submittedProjectId } : {}),
      ...(value('groupId') ? { groupId: value('groupId') } : {}),
      ...(value('parentId') ? { parentId: value('parentId') } : {}),
      visibility: data.get('private') ? 'private' : 'public',
      urgency,
    });
    if (!task) {
      form.reset();
      setUrgency(defaultUrgency);
      setCategoryId('');
      setProjectId('');
    }
  }
  return (
    <form className="task-form" onSubmit={submit}>
      <label>
        Task label
        <input name="label" required maxLength={300} defaultValue={task?.label} />
      </label>
      <label>
        Link
        <input name="link" type="url" pattern="https://.*" defaultValue={task?.link} />
      </label>
      <label>
        Memo
        <textarea name="memo" maxLength={20000} defaultValue={task?.memo} />
      </label>
      <div className="form-grid">
        <label>
          Priority
          <UrgencyField value={urgency} onChange={setUrgency} label="Priority" />
        </label>
        <label>
          Due date and time
          <input name="dueAt" type="datetime-local" defaultValue={task?.dueAt?.slice(0, 16)} />
        </label>
        <label>
          Time zone
          <input
            name="dueTimeZone"
            defaultValue={task?.dueTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}
          />
        </label>
        <label>
          Assignee
          <AssigneePicker
            assignees={assignees}
            {...(task?.assigneeId || (!task && defaultAssigneeId)
              ? { defaultValue: task?.assigneeId ?? defaultAssigneeId }
              : {})}
          />
        </label>
        <label>
          Category
          <CategoryPicker
            categories={categories}
            value={categoryId}
            onChange={(nextCategoryId) => {
              setCategoryId(nextCategoryId);
              if (
                projectId &&
                projects.find((project) => project.id === projectId)?.categoryId !== nextCategoryId
              )
                setProjectId('');
            }}
          />
        </label>
        <ProjectPicker
          categories={categories}
          projects={projects}
          categoryId={categoryId}
          value={projectId}
          onChange={(nextProjectId) => {
            setProjectId(nextProjectId);
            const nextCategoryId = projects.find(
              (project) => project.id === nextProjectId,
            )?.categoryId;
            if (nextCategoryId) setCategoryId(nextCategoryId);
          }}
        />
        <label>
          Group
          <input name="groupId" defaultValue={task?.groupId} />
        </label>
        <label>
          Parent task
          <select name="parentId" defaultValue={task?.parentId ?? ''}>
            <option value="">No parent task</option>
            {openParentTasks.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="checkbox">
        <input name="private" type="checkbox" defaultChecked={task?.visibility === 'private'} />{' '}
        Private task
      </label>
      <button>{submitLabel}</button>
    </form>
  );
}
