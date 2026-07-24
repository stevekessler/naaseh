import { useState, type FormEvent } from 'react';
import type { GroupView } from '@naaseh/domain';

export function JoinGroupDialog({
  group,
  join,
  close,
}: {
  group: GroupView;
  join: (pin?: string) => Promise<void>;
  close: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pin = String(new FormData(event.currentTarget).get('pin') ?? '');
    setBusy(true);
    setError('');
    try {
      await join(pin || undefined);
      close();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to join group.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog open aria-labelledby="join-group-title">
      <form onSubmit={submit}>
        <h2 id="join-group-title">Join {group.name}</h2>
        {group.hasJoinPin && (
          <label>
            Group PIN
            <input name="pin" type="password" inputMode="numeric" pattern="[0-9]{6,32}" required />
          </label>
        )}
        <p>Joining records your acceptance. It does not expose anyone’s private tasks.</p>
        {error && <p role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" className="quiet" onClick={close}>
            Cancel
          </button>
          <button disabled={busy}>{busy ? 'Joining…' : 'Join group'}</button>
        </div>
      </form>
    </dialog>
  );
}
