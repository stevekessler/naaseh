import { useState } from 'react';
import { defaultUrgency, type CategoryRecord, type Project, type Urgency } from '@naaseh/domain';
import { ProjectPicker } from '../projects/ProjectPicker.js';
import { UrgencyField } from '../../components/UrgencyField.js';
export function ListForm({
  save,
  label = 'Create list',
  categories = [],
  projects = [],
}: {
  save: (name: string, projectId?: string, urgency?: Urgency) => Promise<void>;
  label?: string;
  categories?: CategoryRecord[];
  projects?: Project[];
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [urgency, setUrgency] = useState<Urgency>(defaultUrgency);
  return (
    <form
      className="task-form"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        const projectId = String(new FormData(event.currentTarget).get('projectId') ?? '');
        void save(name, projectId || undefined, urgency)
          .then(() => {
            setName('');
            setUrgency(defaultUrgency);
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
        Urgency
        <UrgencyField value={urgency} onChange={setUrgency} />
      </label>
      <ProjectPicker categories={categories} projects={projects} />
      <button disabled={busy}>{busy ? 'Saving…' : label}</button>
    </form>
  );
}
