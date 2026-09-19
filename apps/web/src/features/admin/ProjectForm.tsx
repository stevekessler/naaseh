import { useState } from 'react';
import type { CategoryRecord, Project } from '@naaseh/domain';

export function ProjectForm({
  categories,
  initial,
  save,
}: {
  categories: CategoryRecord[];
  initial?: Project;
  save: (value: { categoryId: string; name: string; endDate?: string }) => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <form
      className="organization-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (saving) return;
        const form = event.currentTarget;
        const data = new FormData(form);
        const endDate = String(data.get('endDate') ?? '');
        setSaving(true);
        setError('');
        void Promise.resolve()
          .then(() =>
            save({
              categoryId: String(data.get('categoryId')),
              name: String(data.get('name')).trim(),
              ...(endDate ? { endDate } : {}),
            }),
          )
          .then(() => {
            if (!initial) form.reset();
          })
          .catch(() => setError('The project could not be saved. Please try again.'))
          .finally(() => setSaving(false));
      }}
    >
      <label>
        Category
        <select name="categoryId" required defaultValue={initial?.categoryId}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Project name
        <input name="name" required maxLength={80} defaultValue={initial?.name} />
      </label>
      <label>
        End date
        <input name="endDate" type="date" defaultValue={initial?.endDate} />
      </label>
      <button disabled={saving}>
        {saving ? 'Saving…' : initial ? 'Save Project' : 'Create Project'}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
