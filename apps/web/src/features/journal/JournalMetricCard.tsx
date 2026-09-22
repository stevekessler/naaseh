import type { JournalDashboardMetric } from '@naaseh/domain';
import { journalMetricKindLabel, journalMetricLabel } from './journal-metric-labels.js';

export function formatJournalMetricValue(metric: JournalDashboardMetric) {
  if (metric.value === 'noData') return 'No data';
  const precision = metric.metric === 'hoursOfSleep' ? 1 : 0;
  return metric.value.toFixed(precision).replace(/\.0$/u, '');
}

export function JournalMetricCard({
  metric,
  onOpen,
}: {
  metric: JournalDashboardMetric;
  onOpen: () => void;
}) {
  const trend =
    metric.trend === 'up'
      ? '↑ Increased'
      : metric.trend === 'down'
        ? '↓ Decreased'
        : metric.trend === 'unchanged'
          ? 'Unchanged'
          : 'Not comparable';
  const value = formatJournalMetricValue(metric);
  const label = journalMetricLabel(metric.metric);
  const kind = journalMetricKindLabel(metric.kind);
  return (
    <button
      type="button"
      className={`journal-metric journal-metric-${metric.kind}`}
      aria-label={`${label}: ${value}; ${kind}; ${trend}`}
      onClick={onOpen}
    >
      <strong>{label}</strong>
      <span>{value}</span>
      <small>{kind}</small>
      <span>{trend}</span>
    </button>
  );
}
