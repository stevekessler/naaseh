import { useState, type FormEvent } from 'react';
export function TaskComposer({
  onAdd,
}: {
  onAdd: (label: string, memo: string, dueAt?: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const due = String(data.get('dueAt') ?? '');
    await onAdd(String(data.get('label')), String(data.get('memo') ?? ''), due || undefined);
    form.reset();
    setExpanded(false);
  }
  return (
    <form className="composer" onSubmit={submit}>
      <input
        name="label"
        aria-label="Task label"
        placeholder="What needs doing?"
        required
        onFocus={() => setExpanded(true)}
      />
      {expanded && (
        <>
          <textarea name="memo" aria-label="Memo" placeholder="Add a memo" />
          <label>
            <span>Due</span>
            <input name="dueAt" type="datetime-local" />
          </label>
          <div className="composer-actions">
            <button type="button" className="quiet" onClick={() => setExpanded(false)}>
              Cancel
            </button>
            <button type="submit">Add task</button>
          </div>
        </>
      )}
    </form>
  );
}
