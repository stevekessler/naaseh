import type { GoogleSyncConflict } from '@naaseh/domain';
import { useState } from 'react';

export function GoogleSyncConflicts({
  conflicts,
  onResolve,
}: {
  conflicts: GoogleSyncConflict[];
  onResolve: (
    conflict: GoogleSyncConflict,
    source: 'local' | 'google' | 'edited',
    editedValue?: string,
  ) => Promise<void>;
}) {
  const [edited, setEdited] = useState<Record<string, string>>({});
  if (!conflicts.length) return null;
  return (
    <section aria-labelledby="google-conflicts-heading">
      <h2 id="google-conflicts-heading">Changes needing your choice</h2>
      {conflicts.map((conflict) => (
        <article key={conflict.id}>
          <h3>{conflict.field}</h3>
          <p>Na'aseh: {conflict.localValue}</p>
          <p>Google: {conflict.remoteValue}</p>
          <button type="button" onClick={() => void onResolve(conflict, 'local')}>
            Use Na'aseh
          </button>
          <button type="button" onClick={() => void onResolve(conflict, 'google')}>
            Use Google
          </button>
          <label>
            Edit value
            <input
              value={edited[conflict.id] ?? ''}
              onChange={(event) =>
                setEdited((current) => ({
                  ...current,
                  [conflict.id]: event.target.value,
                }))
              }
            />
          </label>
          <button
            type="button"
            disabled={!edited[conflict.id]}
            onClick={() => void onResolve(conflict, 'edited', edited[conflict.id])}
          >
            Use edited value
          </button>
        </article>
      ))}
    </section>
  );
}
