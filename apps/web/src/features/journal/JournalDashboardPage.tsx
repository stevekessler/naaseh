import {
  buildDashboardPeriod,
  calculateJournalDashboard,
  type JournalDashboardMetric,
  type JournalEntryProjection,
} from '@naaseh/domain';
import { useMemo, useState } from 'react';
import { JournalMetricCard } from './JournalMetricCard.js';
import { JournalMetricDialog } from './JournalMetricDialog.js';

const defaultRange = () => {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  return { start: start.toLocaleDateString('en-CA'), end: end.toLocaleDateString('en-CA') };
};
export function JournalDashboardPage({
  entries,
  suicidalSelfHarmEnabled,
  openEntry,
  online = navigator.onLine,
  loading = false,
  loadError,
}: {
  entries: JournalEntryProjection[];
  suicidalSelfHarmEnabled: boolean;
  openEntry: (id: string) => void;
  online?: boolean;
  loading?: boolean;
  loadError?: string;
}) {
  const initial = useMemo(defaultRange, []);
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [selected, setSelected] = useState<JournalDashboardMetric>();
  let metrics: JournalDashboardMetric[] = [];
  let error = '';
  try {
    buildDashboardPeriod(start, end);
    metrics = calculateJournalDashboard(entries, { start, end }, { suicidalSelfHarmEnabled });
  } catch (caught) {
    error = caught instanceof Error ? caught.message : 'Invalid period';
  }
  return (
    <section aria-busy={loading}>
      <h2>Journal dashboard</h2>
      <p aria-live="polite">
        {loading
          ? 'Loading encrypted projections…'
          : loadError
            ? `Dashboard unavailable: ${loadError}`
            : online
              ? 'Calculated privately on this device.'
              : 'Offline: calculated from encrypted entries on this device.'}
      </p>
      <label>
        Start date
        <input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
      </label>
      <label>
        End date
        <input type="date" value={end} onChange={(event) => setEnd(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="journal-metric-grid" aria-label="Journal wellness metrics">
        {metrics.map((metric) => (
          <JournalMetricCard
            key={metric.metric}
            metric={metric}
            onOpen={() => setSelected(metric)}
          />
        ))}
      </div>
      <JournalMetricDialog
        {...(selected ? { metric: selected } : {})}
        entries={entries}
        close={() => setSelected(undefined)}
        openEntry={openEntry}
      />
    </section>
  );
}
