import { useState } from 'react';
import type { CategoryRecord, Project } from '@naaseh/domain';
import { ProjectPicker } from '../projects/ProjectPicker.js';
export function ListForm({
  save,
  label = 'Create list',
  categories = [],
  projects = [],
}: {
  save: (name: string, projectId?: string) => Promise<void>;
  label?: string;
  categories?: CategoryRecord[];
  projects?: Project[];
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="task-form"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        const projectId = String(new FormData(event.currentTarget).get('projectId') ?? '');
        void save(name, projectId || undefined)
          .then(() => setName(''))
          .finally(() => setBusy(false));
      }}
    >
      <label>
        List name
        <input
          required
          maxLength={300}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <ProjectPicker categories={categories} projects={projects} />
      <button disabled={busy}>{busy ? 'Saving…' : label}</button>
    </form>
  );
}
