import { useState } from 'react';
import type { LocalArchiveEntry } from '../../db/archive-repository.js';
import { PermanentDeleteDialog } from './PermanentDeleteDialog.js';

export function ArchivePage({
  entries,
  restore,
  csrfToken,
}: {
  entries: LocalArchiveEntry[];
  restore: (entry: LocalArchiveEntry) => Promise<void>;
  csrfToken: string;
}) {
  const [query, setQuery] = useState('');
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  const visible = entries.filter((entry) => {
    const title = entry.task?.label ?? entry.list?.name ?? '';
    return !normalized || title.toLocaleLowerCase().includes(normalized);
  });
  return (
    <section aria-labelledby="archive-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Finished and saved</p>
          <h1 id="archive-heading">Archive</h1>
        </div>
      </header>
      <label>
        Search archive
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {visible.length === 0 ? (
        <p role="status">No archived work matches this search.</p>
      ) : (
        <ul className="archive-results">
          {visible.map((entry) => {
            const value = entry.task ?? entry.list!;
            return (
              <li key={`${entry.kind}:${value.id}`}>
                <article>
                  <h2>{entry.task?.label ?? entry.list?.name}</h2>
                  <p>
                    {entry.kind === 'task' ? 'To-do' : 'List'}
                    {entry.pending ? ' · Sync pending' : ''}
                    {entry.conflicted ? ' · Needs attention' : ''}
                  </p>
                  {entry.items && (
                    <ul>
                      {entry.items.map((item) => (
                        <li key={item.id}>{item.directorySnapshot.name}</li>
                      ))}
                    </ul>
                  )}
                  <button type="button" onClick={() => void restore(entry)}>
                    Restore
                  </button>
                  <PermanentDeleteDialog
                    target={{
                      resourceType: entry.kind,
                      resourceId: value.id,
                      version: value.version,
                    }}
                    label={entry.task?.label ?? entry.list?.name ?? 'work'}
                    csrfToken={csrfToken}
                    disabled={value.lifecycle === 'deleting'}
                  />
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
