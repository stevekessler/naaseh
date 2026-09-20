import { useState, type FormEvent } from 'react';
import { AssigneePicker, type AssigneeOption } from '../../components/AssigneePicker.js';
export function CategoryForm({
  save,
  initial,
  assignees = [],
  cancel,
}: {
  save: (value: {
    name: string;
    color: string;
    defaultAssigneeId?: string;
  }) => Promise<void> | void;
  initial?: { name: string; color: string; defaultAssigneeId?: string | undefined };
  assignees?: readonly AssigneeOption[];
  cancel?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="organization-form"
      onSubmit={(e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (saving) return;
        const form = e.currentTarget;
        const data = new FormData(form);
        const assignee = String(data.get('assignee') ?? '');
        setSaving(true);
        setError('');
        void Promise.resolve()
          .then(() =>
            save({
              name: String(data.get('name')).trim(),
              color: String(data.get('color')),
              ...(assignee ? { defaultAssigneeId: assignee } : {}),
            }),
          )
          .then(() => {
            if (!initial) form.reset();
          })
          .catch(() => setError('The category could not be saved. Please try again.'))
          .finally(() => setSaving(false));
      }}
    >
      <label>
        Name
        <input name="name" required maxLength={100} defaultValue={initial?.name} />
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
      <div className="dialog-actions">
        <button disabled={saving}>{saving ? 'Saving…' : 'Save category'}</button>
        {cancel && (
          <button type="button" className="quiet" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
