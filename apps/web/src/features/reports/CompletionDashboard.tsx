import { useEffect, useMemo, useState } from 'react';
import type { CategoryRecord, CompletionEvent, Project } from '@naaseh/domain';
import {
  loadReportingPreferences,
  saveReportingPreferences,
} from '../../db/preferences-repository.js';
import { bucketCompletionEvents } from './completion-bucketing.js';
import { CompletionFilters, type CompletionFilterValue } from './CompletionFilters.js';

const dateOffset = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export function CompletionDashboard({
  events,
  categories,
  projects,
  pending,
}: {
  events: readonly CompletionEvent[];
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  pending: number;
}) {
  const [filters, setFilters] = useState<CompletionFilterValue>({
    period: 'day',
    categoryId: '',
    projectId: '',
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    weekStartsOn: 0,
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
        ...(filters.categoryId ? { categoryId: filters.categoryId as string | 'unassigned' } : {}),
        ...(filters.projectId ? { projectId: filters.projectId as string | 'unassigned' } : {}),
      }),
    [events, filters],
  );
  const maximum = Math.max(1, ...report.buckets.map((bucket) => bucket.count));
  return (
    <section aria-labelledby="completion-dashboard-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Your completed to-dos</p>
          <h1 id="completion-dashboard-heading">Completion dashboard</h1>
        </div>
        <strong aria-label={`${report.total} completed to-dos`}>{report.total} completed</strong>
      </header>
      <CompletionFilters
        value={filters}
        categories={categories}
        projects={projects}
        change={(next) => {
          setFilters(next);
          void saveReportingPreferences({
            timeZone: next.timeZone,
            weekStartsOn: next.weekStartsOn,
          });
        }}
      />
      <p className="muted" role="status">
        {pending
          ? `${pending} local change${pending === 1 ? '' : 's'} pending sync.`
          : 'Up to date.'}
      </p>
      <ol className="completion-chart" aria-label="Completion totals by period">
        {report.buckets.map((bucket) => (
          <li key={bucket.key}>
            <span>{bucket.key}</span>
            <span
              className="completion-bar"
              style={
                {
                  '--completion-percent': `${(bucket.count / maximum) * 100}%`,
                } as React.CSSProperties
              }
            >
              {bucket.count}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
