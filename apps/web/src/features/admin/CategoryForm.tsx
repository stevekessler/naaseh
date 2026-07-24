import { type FormEvent } from 'react';
export function CategoryForm({
  save,
}: {
  save: (value: { name: string; color: string; defaultAssigneeId?: string }) => void;
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
        <input name="name" required />
      </label>
      <label>
        Color
        <input name="color" type="color" />
      </label>
      <label>
        Default assignee
        <input name="assignee" />
      </label>
      <button>Save category</button>
    </form>
  );
}
