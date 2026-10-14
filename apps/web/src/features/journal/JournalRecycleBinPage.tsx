import type { JournalEntryDraft } from './JournalEntryEditor.js';

export function JournalRecycleBinPage({
  entries,
  restore,
}: {
  entries: JournalEntryDraft[];
  restore: (entry: JournalEntryDraft) => Promise<void>;
}) {
  const sorted = [...entries].sort((left, right) =>
    (right.projection.recycledAt ?? '').localeCompare(left.projection.recycledAt ?? ''),
  );
  return (
    <section>
      <h2>Recycle bin</h2>
      <p>Recycled entries keep their original date until you restore them.</p>
      {sorted.length ? (
        <ol>
          {sorted.map((entry) => (
            <li key={entry.projection.id}>
              <span>
                {entry.projection.date} — moved{' '}
                {entry.projection.recycledAt
                  ? new Date(entry.projection.recycledAt).toLocaleString()
                  : 'recently'}
              </span>{' '}
              <button type="button" onClick={() => void restore(entry)}>
                Restore
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>The recycle bin is empty.</p>
      )}
    </section>
  );
}
