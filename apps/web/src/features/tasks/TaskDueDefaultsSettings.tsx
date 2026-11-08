import type { TaskDueDefaults } from '@naaseh/domain';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type FormEvent } from 'react';
import { loadTaskDueDefaults, saveTaskDueDefaults } from '../../db/preferences-repository.js';

export function TaskDueDefaultsSettings({
  userId,
  csrfToken,
}: {
  userId: string;
  csrfToken: string;
}) {
  const [updated, setUpdated] = useState(false);
  const saved = useLiveQuery(async () => (await loadTaskDueDefaults(userId)) ?? null, [userId]);
  if (saved === undefined) return <p role="status">Loading task defaults…</p>;
  return (
    <>
      <DefaultsForm
        key={JSON.stringify(saved)}
        userId={userId}
        csrfToken={csrfToken}
        saved={saved}
        onSaved={() => setUpdated(true)}
      />
      {updated && <p role="status">Task defaults saved.</p>}
    </>
  );
}

function DefaultsForm({
  userId,
  csrfToken,
  saved,
  onSaved,
}: {
  userId: string;
  csrfToken: string;
  saved: TaskDueDefaults | null;
  onSaved: () => void;
}) {
  const [enabled, setEnabled] = useState(Boolean(saved));
  const [mode, setMode] = useState(saved?.timeMode ?? 'none');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError('');
    try {
      await saveTaskDueDefaults(
        userId,
        csrfToken,
        enabled
          ? {
              days: Number(data.get('days')),
              timeMode: mode,
              time: String(data.get('time') ?? saved?.time ?? '15:00'),
              hours: Number(data.get('hours') ?? saved?.hours ?? 3),
            }
          : null,
      );
      onSaved();
    } catch {
      setError('Your task defaults could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="task-due-defaults" onSubmit={submit}>
      <p>Prefill due dates on new tasks across your browsers.</p>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.currentTarget.checked)}
        />
        Set a default due date
      </label>
      <fieldset hidden={!enabled} disabled={!enabled || saving}>
        <legend>Due date and time</legend>
        <label>
          Days after today (0 is today)
          <input
            name="days"
            type="number"
            min="0"
            max="3650"
            defaultValue={saved?.days ?? 0}
            required
          />
        </label>
        <label>
          Default time
          <select
            value={mode}
            onChange={(event) => setMode(event.currentTarget.value as TaskDueDefaults['timeMode'])}
          >
            <option value="none">Date only</option>
            <option value="clock">At a fixed time</option>
            <option value="relative">Hours from now</option>
          </select>
        </label>
        {mode === 'clock' && (
          <label>
            Time of day
            <input name="time" type="time" defaultValue={saved?.time ?? '15:00'} required />
          </label>
        )}
        {mode === 'relative' && (
          <label>
            Hours to add to the current time
            <input
              name="hours"
              type="number"
              min="0"
              max="168"
              defaultValue={saved?.hours ?? 3}
              required
            />
          </label>
        )}
      </fieldset>
      <button disabled={saving}>{saving ? 'Saving…' : 'Save task defaults'}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
