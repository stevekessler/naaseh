import { type FormEvent } from 'react';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
export function CategoryForm({
  save,
  initial,
  assignees = [],
}: {
  save: (value: { name: string; color: string; defaultAssigneeId?: string }) => void;
  initial?: { name: string; color: string; defaultAssigneeId?: string | undefined };
  assignees?: readonly AssigneeOption[];
}) {
  return (
    <form
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const assignee = String(data.get('assignee') ?? '');
        save({
          name: String(data.get('name')),
          color: String(data.get('color')),
          ...(assignee ? { defaultAssigneeId: assignee } : {}),
        });
      }}
    >
      <label>
        Name
        <input name="name" required defaultValue={initial?.name} />
      </label>
      <label>
        Color
        <input name="color" type="color" defaultValue={initial?.color ?? '#4f46e5'} />
      </label>
      <label>
        Default assignee
        <AssigneePicker
          name="assignee"
          assignees={assignees}
          {...(initial?.defaultAssigneeId ? { defaultValue: initial.defaultAssigneeId } : {})}
        />
      </label>
      <button>Save category</button>
    </form>
  );
}
