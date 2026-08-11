import { useEffect, useMemo, useState } from 'react';
import {
  normalizeUrgencySet,
  type CategoryRecord,
  type CompletionEvent,
  type Project,
  type Urgency,
  type UrgencyCounts,
} from '@naaseh/domain';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UrgencyBreakdown } from '../../components/UrgencyBreakdown.js';
import {
  loadReportingPreferences,
  saveReportingPreferences,
} from '../../db/preferences-repository.js';
import { bucketCompletionEvents } from './completion-bucketing.js';
import { projectCompletionChart } from './completion-presentation.js';
import { CompletionFilters, type CompletionFilterValue } from './CompletionFilters.js';

const dateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export interface CompletionDetailRow {
  id: string;
  label: string;
  urgencyAtCompletion: Urgency | string;
  overallRank?: number;
  projectRank?: number;
}

export type CompletionReportError =
  | 'calculation_failed'
  | 'invalid_cursor'
  | 'expired_cursor'
  | 'context_changed';

export interface CompletionReportState {
  source?: 'network' | 'cache';
  offline?: boolean;
  lastSyncedAt?: string;
  pendingUrgencyChanges?: number;
  stale?: boolean;
  error?: CompletionReportError;
}

export interface CompletionDashboardProps {
  events: readonly CompletionEvent[];
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  pending: number;
  urgencyCounts?: UrgencyCounts;
  selectedUrgencies?: readonly string[];
  changeUrgencies?: (values: string[]) => void;
  detailRows?: readonly CompletionDetailRow[];
  orderBy?: 'completedAt' | 'overallRank' | 'projectRank';
  changeOrder?: (order: 'completedAt' | 'overallRank' | 'projectRank') => void;
  nextCursor?: string | null;
  loadMore?: () => void;
  reportState?: CompletionReportState;
  retry?: () => void;
  restart?: () => void;
  refreshAfterReconnect?: () => void;
  remoteReport?: {
    total: number;
    urgencyCounts: UrgencyCounts;
    buckets: Array<{ key: string; count: number }>;
  };
  changeFilters?: (value: CompletionFilterValue) => void;
  exportCsv?: () => void;
}

const cursorErrorCopy: Partial<Record<CompletionReportError, string>> = {
  invalid_cursor: 'Report continuation is invalid.',
  expired_cursor: 'Report continuation is expired.',
  context_changed: 'Report continuation is changed because access or report context changed.',
};

export function CompletionDashboard({
  events,
  categories,
  projects,
  pending,
  urgencyCounts,
  selectedUrgencies = [],
  changeUrgencies,
  detailRows = [],
  orderBy = 'completedAt',
  changeOrder,
  nextCursor,
  loadMore,
  reportState,
  retry,
  restart,
  refreshAfterReconnect,
  remoteReport,
  changeFilters,
  exportCsv,
}: CompletionDashboardProps) {
  const initialUrgencies = normalizeUrgencySet(selectedUrgencies as Urgency[]);
  const [filters, setFilters] = useState<CompletionFilterValue>({
    period: 'day',
    categoryId: '',
    projectId: '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    weekStartsOn: 0,
    urgencies: initialUrgencies,
  });
  useEffect(() => {
    void loadReportingPreferences().then((preferences) =>
      setFilters((current) => ({ ...current, ...preferences })),
    );
  }, []);
  const report = useMemo(
    () =>
      bucketCompletionEvents(events, {
        period: filters.period,
        timeZone: filters.timeZone,
        weekStartsOn: filters.weekStartsOn,
        from: dateOffset(-29),
        to: dateOffset(0),
        urgencies: filters.urgencies,
        ...(filters.categoryId ? { categoryId: filters.categoryId as string | 'unassigned' } : {}),
        ...(filters.projectId ? { projectId: filters.projectId as string | 'unassigned' } : {}),
      }),
    [events, filters],
  );
  const displayedBuckets = remoteReport?.buckets ?? report.buckets;
  const displayedTotal = remoteReport?.total ?? report.total;
  const chart = projectCompletionChart(
    displayedBuckets,
    Boolean(filters.categoryId || filters.projectId || filters.urgencies.length),
  );
  const sortedRows = [...detailRows].sort((left, right) => {
    if (orderBy === 'overallRank')
      return (left.overallRank ?? Infinity) - (right.overallRank ?? Infinity);
    if (orderBy === 'projectRank')
      return (left.projectRank ?? Infinity) - (right.projectRank ?? Infinity);
    return 0;
  });
  const cursorError = reportState?.error ? cursorErrorCopy[reportState.error] : undefined;
  return (
    <section aria-labelledby="completion-dashboard-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Your completed to-dos</p>
          <h1 id="completion-dashboard-heading">Completed Tasks</h1>
        </div>
        <strong aria-label={`${displayedTotal} completed to-dos`}>
          {displayedTotal} completed
        </strong>
      </header>
      <CompletionFilters
        value={filters}
        categories={categories}
        projects={projects}
        change={(next) => {
          setFilters(next);
          changeUrgencies?.(next.urgencies);
          changeFilters?.(next);
          void saveReportingPreferences({
            timeZone: next.timeZone,
            weekStartsOn: next.weekStartsOn,
          });
        }}
      />
      <p className="muted">This report uses the priority captured when each to-do was completed.</p>
      <UrgencyBreakdown
        counts={urgencyCounts ?? remoteReport?.urgencyCounts ?? report.urgencyCounts}
        label="Priority at completion"
      />
      {exportCsv ? (
        <button type="button" onClick={exportCsv}>
          Export CSV
        </button>
      ) : null}
      {reportState?.offline && reportState.source === 'cache' ? (
        <p role="status">Offline · showing previously synchronized report</p>
      ) : null}
      {reportState?.lastSyncedAt ? (
        <p>Last synchronized {new Date(reportState.lastSyncedAt).toLocaleString()}</p>
      ) : null}
      {reportState?.pendingUrgencyChanges ? (
        <p role="status">
          {reportState.pendingUrgencyChanges} local priority change
          {reportState.pendingUrgencyChanges === 1 ? '' : 's'} pending. Report includes pending
          local values.
        </p>
      ) : null}
      {reportState?.stale ? (
        <div role="status">
          <p>This cached report may be out of date.</p>
          {refreshAfterReconnect ? (
            <button type="button" onClick={refreshAfterReconnect}>
              Refresh after reconnect
            </button>
          ) : null}
        </div>
      ) : null}
      {reportState?.error === 'calculation_failed' ? (
        <div role="alert">
          <p>Unable to calculate this report.</p>
          {retry ? (
            <button type="button" onClick={retry}>
              Retry report
            </button>
          ) : null}
        </div>
      ) : null}
      {chart.kind === 'invalid' && reportState?.error !== 'calculation_failed' ? (
        <div role="alert">
          <p>Unable to calculate this report.</p>
          {retry ? (
            <button type="button" onClick={retry}>
              Retry report
            </button>
          ) : null}
        </div>
      ) : null}
      {cursorError ? (
        <div role="alert">
          <p>{cursorError}</p>
          {restart ? (
            <button type="button" onClick={restart}>
              Restart report
            </button>
          ) : null}
        </div>
      ) : null}
      <p className="muted" role="status">
        {pending
          ? `${pending} local change${pending === 1 ? '' : 's'} pending sync.`
          : 'Up to date.'}
      </p>
      {chart.kind === 'ready' ? (
        <ol className="completion-chart" aria-label="Completion totals by period">
          {chart.visiblePeriods.map((bucket) => (
            <li key={bucket.key}>
              <span>{bucket.key}</span>
              <span
                className="completion-bar"
                style={
                  {
                    '--completion-percent': `${(bucket.count / chart.maximum) * 100}%`,
                  } as React.CSSProperties
                }
              >
                {bucket.count}
              </span>
            </li>
          ))}
        </ol>
      ) : chart.kind === 'empty' ? (
        <p className="empty completion-empty" role="status">
          {chart.emptyReason === 'filtered'
            ? 'No completed tasks match the current filters.'
            : 'No completed tasks occurred in the selected range.'}
        </p>
      ) : null}
      {detailRows.length ? (
        <section aria-label="Completion report detail">
          {changeOrder ? (
            <label>
              Sort report rows
              <select
                value={orderBy}
                onChange={(event) => changeOrder(event.target.value as typeof orderBy)}
              >
                <option value="completedAt">Completion time</option>
                <option value="overallRank">Overall rank</option>
                <option value="projectRank">Project rank</option>
              </select>
            </label>
          ) : null}
          <ol>
            {sortedRows.map((row) => (
              <li key={row.id}>
                {row.label} <UrgencyBadge urgency={row.urgencyAtCompletion as Urgency} />
                {row.overallRank === undefined ? null : ` Overall position ${row.overallRank}`}
                {row.projectRank === undefined ? null : ` Project position ${row.projectRank}`}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
      {nextCursor && loadMore && !cursorError ? (
        <button type="button" onClick={loadMore}>
          Load more report rows
        </button>
      ) : null}
    </section>
  );
}
