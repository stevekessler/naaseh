import { useEffect, useMemo, useState } from 'react';
import {
  normalizeUrgencySet,
  type CategoryRecord,
  type CompletionEvent,
  type Project,
  type Task,
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
import { useBrowserTimeZone } from '../tasks/due-value.js';
import { buildTaskReport, downloadTaskReportCsv, type TaskReport } from './task-reporting.js';

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
  tasks?: readonly Task[];
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
  exportCsv?: (filters: CompletionFilterValue, scope: 'filtered' | 'all') => Promise<void> | void;
}

const cursorErrorCopy: Partial<Record<CompletionReportError, string>> = {
  invalid_cursor: 'Report continuation is invalid.',
  expired_cursor: 'Report continuation is expired.',
  context_changed: 'Report continuation is changed because access or report context changed.',
};

export function CompletionDashboard({
  events,
  tasks,
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
  const browserTimeZone = useBrowserTimeZone();
  const [exportState, setExportState] = useState<'idle' | 'running' | 'failed'>('idle');
  const [exportError, setExportError] = useState('');
  const [filters, setFilters] = useState<CompletionFilterValue>({
    period: 'day',
    categoryId: '',
    projectId: '',
    timeZone: browserTimeZone,
    weekStartsOn: 0,
    urgencies: initialUrgencies,
    from: '',
    to: '',
    taskState: 'all',
    timeliness: 'all',
  });
  useEffect(() => {
    void loadReportingPreferences().then((preferences) =>
      setFilters((current) => ({ ...current, ...preferences })),
    );
  }, []);
  useEffect(() => {
    setFilters((current) => {
      if (current.timeZone === browserTimeZone) return current;
      const next = { ...current, timeZone: browserTimeZone };
      changeFilters?.(next);
      return next;
    });
  }, [browserTimeZone, changeFilters]);
  const report = useMemo(
    () =>
      bucketCompletionEvents(events, {
        period: filters.period,
        timeZone: filters.timeZone,
        weekStartsOn: filters.weekStartsOn,
        from: filters.from || dateOffset(-29),
        to: filters.to || dateOffset(0),
        urgencies: filters.urgencies,
        ...(filters.categoryId ? { categoryId: filters.categoryId as string | 'unassigned' } : {}),
        ...(filters.projectId ? { projectId: filters.projectId as string | 'unassigned' } : {}),
      }),
    [events, filters],
  );
  const displayedBuckets = remoteReport?.buckets ?? report.buckets;
  const taskReport = useMemo<TaskReport | undefined>(
    () =>
      tasks && (tasks.length > 0 || !remoteReport)
        ? buildTaskReport(tasks, categories, projects, filters)
        : undefined,
    [tasks, categories, projects, filters, remoteReport],
  );
  const displayedTotal = taskReport?.total ?? remoteReport?.total ?? report.total;
  const chart = projectCompletionChart(
    taskReport?.buckets.map((bucket) => ({ key: bucket.key, count: bucket.closed })) ??
      displayedBuckets,
    Boolean(
      filters.categoryId ||
        filters.projectId ||
        filters.urgencies.length ||
        filters.taskState !== 'all' ||
        filters.timeliness !== 'all',
    ),
  );
  const sortedRows = [...detailRows].sort((left, right) => {
    if (orderBy === 'overallRank')
      return (left.overallRank ?? Infinity) - (right.overallRank ?? Infinity);
    if (orderBy === 'projectRank')
      return (left.projectRank ?? Infinity) - (right.projectRank ?? Infinity);
    return 0;
  });
  const cursorError = reportState?.error ? cursorErrorCopy[reportState.error] : undefined;
  const runExport = (scope: 'filtered' | 'all') => {
    setExportState('running');
    setExportError('');
    const selectedFilters =
      scope === 'filtered'
        ? filters
        : {
            ...filters,
            categoryId: '',
            projectId: '',
            urgencies: [],
            from: '',
            to: '',
            taskState: 'all' as const,
            timeliness: 'all' as const,
          };
    const action = exportCsv
      ? exportCsv(selectedFilters, scope)
      : tasks
        ? downloadTaskReportCsv(
            buildTaskReport(tasks, categories, projects, selectedFilters).rows,
            scope === 'filtered' ? 'task-report-filtered.csv' : 'task-report-all.csv',
          )
        : Promise.reject(new Error('Task data is not available for export.'));
    void Promise.resolve(action)
      .then(() => setExportState('idle'))
      .catch((error: Error) => {
        setExportError(error.message);
        setExportState('failed');
      });
  };
  return (
    <section aria-labelledby="completion-dashboard-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Open and completed work</p>
          <h1 id="completion-dashboard-heading">Task Reporting</h1>
        </div>
        <strong aria-label={`${displayedTotal} tasks in this report`}>
          {displayedTotal} tasks
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
            weekStartsOn: next.weekStartsOn,
          });
        }}
      />
      {taskReport ? (
        <dl className="task-report-summary" aria-label="Task report summary">
          <div>
            <dt>Tasks</dt>
            <dd>{taskReport.total}</dd>
          </div>
          <div>
            <dt>Open</dt>
            <dd>{taskReport.open}</dd>
          </div>
          <div>
            <dt>Closed</dt>
            <dd>{taskReport.closed}</dd>
          </div>
          <div>
            <dt>Closed on time</dt>
            <dd>{taskReport.onTime}</dd>
          </div>
          <div>
            <dt>Closed late</dt>
            <dd>{taskReport.delayed}</dd>
          </div>
          <div>
            <dt>Closed without a due date</dt>
            <dd>{taskReport.withoutDueDate}</dd>
          </div>
        </dl>
      ) : null}
      <p className="muted">
        Open work is reported by creation date; closed work is reported by completion date.
      </p>
      <UrgencyBreakdown
        counts={
          taskReport?.urgencyCounts ??
          urgencyCounts ??
          remoteReport?.urgencyCounts ??
          report.urgencyCounts
        }
        label="Tasks by priority"
      />
      <div className="task-report-export-actions">
        <button
          type="button"
          disabled={exportState === 'running'}
          onClick={() => runExport('filtered')}
        >
          {exportState === 'running' ? 'Preparing export…' : 'Export filtered CSV'}
        </button>
        <button type="button" disabled={exportState === 'running'} onClick={() => runExport('all')}>
          Export all task data
        </button>
      </div>
      {exportState === 'failed' ? (
        <p role="alert">
          Export failed: {exportError || 'The file could not be prepared.'} Try again; no partial
          file was saved.
        </p>
      ) : null}
      {reportState?.offline && reportState.source === 'cache' ? (
        <p role="status">Offline · showing previously synchronized report</p>
      ) : null}
      {reportState?.lastSyncedAt ? (
        <p>
          Last synchronized{' '}
          {new Date(reportState.lastSyncedAt).toLocaleString('en-US', { hour12: true })}
        </p>
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
      {!taskReport && reportState?.error === 'calculation_failed' ? (
        <div role="alert">
          <p>Unable to calculate this report.</p>
          {retry ? (
            <button type="button" onClick={retry}>
              Retry report
            </button>
          ) : null}
        </div>
      ) : null}
      {!taskReport && chart.kind === 'invalid' && reportState?.error !== 'calculation_failed' ? (
        <div role="alert">
          <p>Unable to calculate this report.</p>
          {retry ? (
            <button type="button" onClick={retry}>
              Retry report
            </button>
          ) : null}
        </div>
      ) : null}
      {!taskReport && cursorError ? (
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
        <ol className="completion-chart" aria-label="Closed task totals by period">
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
            ? 'No tasks match the current filters.'
            : 'No tasks occurred in the selected range.'}
        </p>
      ) : null}
      {taskReport?.groups.length ? (
        <section className="task-report-groups" aria-labelledby="task-report-groups-heading">
          <h2 id="task-report-groups-heading">Organization breakdown</h2>
          <div className="table-scroll" tabIndex={0}>
            <table>
              <thead>
                <tr>
                  <th scope="col">Category</th>
                  <th scope="col">Project</th>
                  <th scope="col">Tasks</th>
                  <th scope="col">Open</th>
                  <th scope="col">Closed</th>
                </tr>
              </thead>
              <tbody>
                {taskReport.groups.map((group) => (
                  <tr key={group.key}>
                    <th scope="row">{group.category}</th>
                    <td>{group.project}</td>
                    <td>{group.total}</td>
                    <td>{group.open}</td>
                    <td>{group.closed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      {!taskReport && detailRows.length ? (
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
      {!taskReport && nextCursor && loadMore && !cursorError ? (
        <button type="button" onClick={loadMore}>
          Load more report rows
        </button>
      ) : null}
    </section>
  );
}
