import type { JournalEntryProjection } from '@naaseh/domain';
import { useMemo, useState } from 'react';
import { journalListModel } from './journal-list-model.js';

export function JournalListPage({
  entries,
  open,
}: {
  entries: JournalEntryProjection[];
  open: (id: string) => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const result = useMemo(() => {
    try {
      return {
        entries: journalListModel(entries, {
          ...(start ? { start } : {}),
          ...(end ? { end } : {}),
        }),
      };
    } catch (error) {
      return {
        entries: journalListModel(entries, {}),
        error: error instanceof Error ? error.message : 'Invalid dates',
      };
    }
  }, [entries, start, end]);
  return (
    <section>
      <h2>Entries</h2>
      <div className="journal-filters">
        <label>
          Start date
          <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
        </label>
        <label>
          End date
          <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
        </label>
        <button
          type="button"
          onClick={() => {
            setStart('');
            setEnd('');
          }}
        >
          Clear filters
        </button>
      </div>
      {result.error && (
        <p role="alert">{result.error} Last valid unfiltered entries remain shown.</p>
      )}
      {result.entries.length ? (
        <ol>
          {result.entries.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => open(entry.id)}>
                {entry.date} — Read or edit entry
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p>No journal entries match this date range.</p>
      )}
    </section>
  );
}
