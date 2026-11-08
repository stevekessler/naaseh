import { useEffect, useId, useRef, useState } from 'react';
import type { Urgency } from '@naaseh/domain';
import { UrgencyField } from '../../components/UrgencyField.js';

export function TaskPriorityDialog({
  urgency,
  save,
  close,
}: {
  urgency: Urgency;
  save: (urgency: Urgency) => void | Promise<void>;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const title = useId();
  const [draft, setDraft] = useState(urgency);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  return (
    <dialog
      ref={ref}
      className="task-edit-dialog"
      aria-labelledby={title}
      onCancel={(event) => {
        event.preventDefault();
        if (!saving) close();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (saving) return;
          setSaving(true);
          setError('');
          try {
            if (draft !== urgency) await save(draft);
            close();
          } catch {
            setError('The priority could not be saved. Try again.');
            setSaving(false);
          }
        }}
      >
        <h2 id={title}>Change priority</h2>
        <label>
          Priority
          <UrgencyField value={draft} onChange={setDraft} disabled={saving} />
        </label>
        <div className="dialog-actions">
          <button disabled={saving}>{saving ? 'Saving…' : 'Save priority'}</button>
          <button type="button" className="quiet" disabled={saving} onClick={close}>
            Cancel
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </dialog>
  );
}
