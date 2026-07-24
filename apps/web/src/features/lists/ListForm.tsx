import { useState } from 'react';
export function ListForm({
  save,
  label = 'Create list',
}: {
  save: (name: string) => Promise<void>;
  label?: string;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="task-form"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void save(name)
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
      <button disabled={busy}>{busy ? 'Saving…' : label}</button>
    </form>
  );
}
