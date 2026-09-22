import { useState } from 'react';
import type { LocalArchiveEntry } from '../../db/archive-repository.js';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { UrgencyBreakdown } from '../../components/UrgencyBreakdown.js';
import { PermanentDeleteDialog } from './PermanentDeleteDialog.js';
import {
  matchesUrgencySet,
  zeroUrgencyCounts,
  type CategoryRecord,
  type Project,
  type UrgencyCounts,
} from '@naaseh/domain';
import { TaskFilters } from '../search/TaskFilters.js';
import type { Filters } from '../../search/task-search.js';
import type { AssigneeOption } from '../../components/AssigneePicker.js';
import { ProgressIndicator } from '../../components/ProgressIndicator.js';
import { matchesProgressFilter } from '../../search/task-search.js';

const archiveDate = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

const formatArchiveDate = (value: string | undefined) =>
  value ? archiveDate.format(new Date(value)) : '—';

export function matchesArchiveFilters(
  entry: LocalArchiveEntry,
  filters: Filters | undefined,
  query: string,
) {
  const task = entry.task;
  const list = entry.list;
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  const searchable = task
    ? `${task.label} ${task.memoHidden ? '' : task.memo}`
    : `${list?.name ?? ''} ${(entry.items ?? [])
        .map((item) => item.directorySnapshot.name)
        .join(' ')}`;
  if (normalized && !searchable.toLocaleLowerCase().includes(normalized)) return false;
  if (!filters) return true;
  const value = task ?? list!;
  if (!matchesUrgencySet(value.urgency, filters.urgencies)) return false;
  if (filters.contentType === 'todos' && !task) return false;
  if (filters.contentType === 'lists' && !list) return false;
  if (
    filters.projectId &&
    (filters.projectId === 'unassigned'
      ? value.projectId !== undefined
      : value.projectId !== filters.projectId)
  )
    return false;
  if (filters.assigneeId && task?.assigneeId !== filters.assigneeId) return false;
  if (filters.categoryId && task?.categoryId !== filters.categoryId) return false;
  if (filters.from && (!task?.dueAt || task.dueAt < filters.from)) return false;
  if (filters.to && (!task?.dueAt || task.dueAt > `${filters.to}T23:59:59.999Z`)) return false;
  if (filters.progress && filters.progress !== 'all') {
    if (!task || !matchesProgressFilter(task.percentComplete, filters.progress)) return false;
  }
  return true;
}

export function ArchivePage({
  entries,
  restore,
  csrfToken,
  filters,
  changeFilters,
  urgencyCounts,
  exportCsv,
  exportState = 'idle',
  retryExport,
  categories = [],
  projects = [],
  assignees = [],
}: {
  entries: LocalArchiveEntry[];
  restore: (entry: LocalArchiveEntry) => Promise<void>;
  csrfToken: string;
  filters?: Filters;
  changeFilters?: (filters: Filters) => void;
  urgencyCounts?: UrgencyCounts;
  exportCsv?: () => void;
  exportState?: 'idle' | 'pending' | 'failed';
  retryExport?: () => void;
  categories?: readonly CategoryRecord[];
  projects?: readonly Project[];
  assignees?: readonly AssigneeOption[];
}) {
  const [query, setQuery] = useState('');
  const archiveFilters = filters ? { ...filters, lifecycle: 'archive' as const } : undefined;
  const visible = entries.filter((entry) => matchesArchiveFilters(entry, archiveFilters, query));
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const calculatedUrgencyCounts = visible.reduce((counts, entry) => {
    counts[(entry.task ?? entry.list!).urgency] += 1;
    return counts;
  }, zeroUrgencyCounts());
  return (
    <section className="archive-page" aria-labelledby="archive-heading">
      <header className="welcome">
        <div>
          <p className="eyebrow">Finished and saved</p>
          <h1 id="archive-heading">Archive</h1>
        </div>
      </header>
      {filters && changeFilters ? (
        <section className="filters" aria-label="Search and filters">
          <TaskFilters
            value={archiveFilters!}
            change={(next) => changeFilters({ ...next, lifecycle: 'archive' })}
            resultCount={visible.length}
            categories={categories}
            projects={projects}
            assignees={assignees}
          />
        </section>
      ) : null}
      <label className="archive-search">
        Search archive
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <UrgencyBreakdown
        counts={urgencyCounts ?? calculatedUrgencyCounts}
        label="Archive priority breakdown"
      />
      {exportCsv ? (
        <section aria-label="Archive export">
          <p>Export columns: Priority, Overall rank, Project rank</p>
          <button type="button" onClick={exportCsv} disabled={exportState === 'pending'}>
            {exportState === 'pending' ? 'Exporting…' : 'Export CSV'}
          </button>
          {exportState === 'failed' ? (
            <div role="alert">
              <p>Unable to export the archive.</p>
              {retryExport ? (
                <button type="button" onClick={retryExport}>
                  Retry export
                </button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {visible.length === 0 ? (
        <p role="status">No archived work matches this search.</p>
      ) : (
        <div className="archive-table-wrap" tabIndex={0}>
          <table className="archive-table">
            <caption className="visually-hidden">Archived tasks and lists</caption>
            <thead>
              <tr>
                <th scope="col">Work</th>
                <th scope="col">Priority</th>
                <th scope="col">Deleted</th>
                <th scope="col">Category</th>
                <th scope="col">Project</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const value = entry.task ?? entry.list!;
                const project = value.projectId ? projectsById.get(value.projectId) : undefined;
                const categoryId = entry.task?.categoryId ?? project?.categoryId;
                const category = categoryId ? categoriesById.get(categoryId) : undefined;
                const archivedAt = value.archivedAt;
                const label = entry.task?.label ?? entry.list?.name ?? 'work';
                return (
                  <tr key={`${entry.kind}:${value.id}`}>
                    <th className="archive-work-cell" scope="row">
                      <h2>{label}</h2>
                      <span className="archive-kind">
                        {entry.kind === 'task' ? 'To-do' : 'List'}
                        {entry.task?.memoHidden ? ' · Private notes' : ''}
                        {entry.pending ? ' · Sync pending' : ''}
                        {entry.conflicted ? ' · Needs attention' : ''}
                      </span>
                      {entry.task ? (
                        <ProgressIndicator
                          percent={entry.task.percentComplete}
                          label={entry.task.label}
                        />
                      ) : null}
                      {entry.items?.length ? (
                        <span className="archive-list-items">
                          {entry.items.map((item) => item.directorySnapshot.name).join(', ')}
                        </span>
                      ) : null}
                    </th>
                    <td>
                      <UrgencyBadge urgency={value.urgency} />
                    </td>
                    <td>
                      {archivedAt ? (
                        <time dateTime={archivedAt} title={new Date(archivedAt).toLocaleString()}>
                          {formatArchiveDate(archivedAt)}
                        </time>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>{category?.name ?? '—'}</td>
                    <td>{project?.name ?? '—'}</td>
                    <td>
                      <div className="archive-actions">
                        <button type="button" onClick={() => void restore(entry)}>
                          Restore
                        </button>
                        <PermanentDeleteDialog
                          target={{
                            resourceType: entry.kind,
                            resourceId: value.id,
                            version: value.version,
                          }}
                          label={label}
                          csrfToken={csrfToken}
                          disabled={value.lifecycle === 'deleting'}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
