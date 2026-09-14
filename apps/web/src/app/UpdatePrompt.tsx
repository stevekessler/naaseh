import { useState } from 'react';

export function UpdatePrompt({ waiting, apply }: { waiting: boolean; apply: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const update = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await apply();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'The update could not be applied. Your saved work is safe. Try again.',
      );
    } finally {
      setBusy(false);
    }
  };
  return waiting ? (
    <aside className="update-prompt" role="status" aria-label="App update">
      <span>
        {error ||
          (busy
            ? 'Preparing the update and checking saved changes…'
            : 'An update is ready. Saved offline work will be preserved.')}
      </span>
      <button type="button" disabled={busy} onClick={() => void update()}>
        {busy ? 'Updating…' : error ? 'Retry update' : 'Update'}
      </button>
    </aside>
  ) : null;
}
