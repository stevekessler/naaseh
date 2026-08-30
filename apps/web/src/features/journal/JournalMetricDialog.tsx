import type { JournalDashboardMetric, JournalEntryProjection } from '@naaseh/domain';
import { useEffect, useRef } from 'react';

export function JournalMetricDialog({
  metric,
  entries,
  close,
  openEntry,
}: {
  metric?: JournalDashboardMetric;
  entries: JournalEntryProjection[];
  close: () => void;
  openEntry: (id: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (metric && !dialog.current?.open) dialog.current?.showModal();
    else if (!metric && dialog.current?.open) dialog.current.close();
  }, [metric]);
  if (!metric) return null;
  const contributing = entries.filter((entry) => metric.contributingEntryIds.includes(entry.id));
  return (
    <dialog ref={dialog} aria-labelledby="journal-metric-title" onClose={close}>
      <h2 id="journal-metric-title">{metric.metric} contributing entries</h2>
      {contributing.length ? (
        <ul>
          {contributing.map((entry) => (
            <li key={entry.id}>
              <button type="button" onClick={() => openEntry(entry.id)}>
                {entry.date}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>No entries contributed to this metric.</p>
      )}
      <button type="button" onClick={() => dialog.current?.close()}>
        Close
      </button>
    </dialog>
  );
}
