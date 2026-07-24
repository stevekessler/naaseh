import { type FormEvent } from 'react';
import type { CategoryRecord, Task, TaskInput } from '@naaseh/domain';
export function TaskForm({
  save,
  task,
  categories = [],
  submitLabel = task ? 'Save changes' : 'Add task',
}: {
  save: (task: TaskInput) => Promise<void>;
  task?: Task;
  categories?: CategoryRecord[];
  submitLabel?: string;
}) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? '').trim();
    const due = value('dueAt');
    const categoryId = value('categoryId');
    const category = categories.find((item) => item.id === categoryId);
    const assigneeId = value('assigneeId') || category?.defaultAssigneeId;
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
      ...(categoryId ? { categoryId } : {}),
      ...(value('groupId') ? { groupId: value('groupId') } : {}),
      ...(value('parentId') ? { parentId: value('parentId') } : {}),
      visibility: data.get('private') ? 'private' : 'public',
    });
    if (!task) form.reset();
  }
  return (
    <form className="task-form" onSubmit={submit}>
      <label>
        Task label
        <input name="label" required maxLength={300} defaultValue={task?.label} />
      </label>
      <label>
        HTTPS link
        <input name="link" type="url" pattern="https://.*" defaultValue={task?.link} />
      </label>
      <label>
        Memo
        <textarea name="memo" maxLength={20000} defaultValue={task?.memo} />
      </label>
      <div className="form-grid">
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
          <input name="assigneeId" defaultValue={task?.assigneeId} />
        </label>
        <label>
          Category
          <input name="categoryId" list="categories" defaultValue={task?.categoryId} />
          <datalist id="categories">
            {categories
              .filter((item) => !item.archived)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </datalist>
        </label>
        <label>
          Group
          <input name="groupId" defaultValue={task?.groupId} />
        </label>
        <label>
          Parent task
          <input name="parentId" defaultValue={task?.parentId} />
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
