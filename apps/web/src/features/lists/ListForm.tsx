import { useState } from 'react';
import { defaultUrgency, type CategoryRecord, type Project, type Urgency } from '@naaseh/domain';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { UrgencyField } from '../../components/UrgencyField.js';
import { CategoryPicker } from '../../components/CategoryPicker.js';
export function ListForm({
  save,
  label = 'Create list',
  categories = [],
  projects = [],
}: {
  save: (name: string, projectId?: string, urgency?: Urgency, categoryId?: string) => Promise<void>;
  label?: string;
  categories?: CategoryRecord[];
  projects?: Project[];
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [urgency, setUrgency] = useState<Urgency>(defaultUrgency);
  const [categoryId, setCategoryId] = useState('');
  const [projectId, setProjectId] = useState('');
  return (
    <form
      className="task-form"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void save(name, projectId || undefined, urgency, categoryId || undefined)
          .then(() => {
            setName('');
            setUrgency(defaultUrgency);
            setCategoryId('');
            setProjectId('');
          })
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
      <label>
        Priority
        <UrgencyField value={urgency} onChange={setUrgency} label="Priority" />
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
        value={projectId}
        categoryId={categoryId}
        onChange={(nextProjectId) => {
          setProjectId(nextProjectId);
          const projectCategoryId = projects.find(
            (project) => project.id === nextProjectId,
          )?.categoryId;
          if (projectCategoryId) setCategoryId(projectCategoryId);
        }}
      />
      <button disabled={busy}>{busy ? 'Saving…' : label}</button>
    </form>
  );
}
