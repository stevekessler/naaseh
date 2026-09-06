import type { JournalDashboardMetric } from '@naaseh/domain';

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
  const value =
    metric.value === 'noData' ? 'No data' : metric.value.toFixed(metric.kind === 'average' ? 1 : 0);
  return (
    <button
      type="button"
      className={`journal-metric journal-metric-${metric.kind}`}
      aria-label={`${metric.metric}: ${value}; ${trend}`}
      onClick={onOpen}
    >
      <strong>{metric.metric}</strong>
      <span>{value}</span>
      <small>{metric.kind}</small>
      <span>{trend}</span>
    </button>
  );
}
