import { useState, type FormEvent } from 'react';

export function CreateGroupDialog({
  create,
  close,
}: {
  create: (name: string, pin?: string) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const pin = String(data.get('pin') ?? '');
    setBusy(true);
    setError('');
    try {
      await create(String(data.get('name') ?? '').trim(), pin || undefined);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to create group.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog open aria-labelledby="create-group-title">
      <form onSubmit={submit}>
        <h2 id="create-group-title">Create group</h2>
        <label>
          Group name
          <input name="name" required maxLength={100} autoFocus />
        </label>
        <label>
          Optional group PIN
          <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,32}" />
        </label>
        <p>A PIN is required before another user can join. It never makes public tasks private.</p>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
        </div>
      </form>
    </dialog>
  );
}
