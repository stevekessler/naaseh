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
import {
  filtersExpandToAllReadable,
  taskMatchesExpression,
  type TaskFilterViewer,
} from '../../search/task-search.js';

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
  viewer?: TaskFilterViewer,
) {
  const task = entry.task;
  const list = entry.list;
  const listItem = entry.listItem;
  const parentList = entry.parentList;
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  const searchable = task
    ? `${task.label} ${task.memoHidden ? '' : task.memo}`
    : listItem
      ? `${listItem.nameOverride ?? listItem.directorySnapshot.name} ${parentList?.name ?? ''}`
      : `${list?.name ?? ''} ${(entry.items ?? [])
          .map((item) => item.nameOverride ?? item.directorySnapshot.name)
          .join(' ')}`;
  if (normalized && !searchable.toLocaleLowerCase().includes(normalized)) return false;
  if (!filters) return true;
  const value = task ?? list ?? parentList!;
  if (
    viewer &&
    !filtersExpandToAllReadable(filters, viewer) &&
    (task
      ? task.assigneeId !== viewer.userId &&
        !(task.groupId && viewer.groupIds.includes(task.groupId))
      : value.ownerId !== viewer.userId &&
        !(value.groupId && viewer.groupIds.includes(value.groupId)))
  )
    return false;
  if (task) return taskMatchesExpression(task, filters);
  if (filters.contentType === 'todos' && !task) return false;
  const conditions: boolean[] = [];
  const assigneeIds = filters.assigneeIds?.length
    ? filters.assigneeIds
    : filters.assigneeId
      ? [filters.assigneeId]
      : [];
  if (assigneeIds.length) conditions.push(false);
  if (filters.groupIds?.length)
    conditions.push(Boolean(value.groupId && filters.groupIds.includes(value.groupId)));
  if (filters.urgencies?.length)
    conditions.push(matchesUrgencySet(value.urgency, filters.urgencies));
  if (filters.projectId)
    conditions.push(
      filters.projectId === 'unassigned'
        ? value.projectId === undefined
        : value.projectId === filters.projectId,
    );
  if (filters.categoryId) conditions.push(value.categoryId === filters.categoryId);
  if (filters.from || filters.to || (filters.progress && filters.progress !== 'all'))
    conditions.push(false);
  return (
    !conditions.length ||
    (filters.match === 'any' ? conditions.some(Boolean) : conditions.every(Boolean))
  );
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
  groups = [],
  currentUserId,
  currentUserGroupIds = [],
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
  groups?: readonly { id: string; name: string }[];
  currentUserId?: string;
  currentUserGroupIds?: readonly string[];
}) {
  const [query, setQuery] = useState('');
  const archiveFilters = filters ? { ...filters, lifecycle: 'archive' as const } : undefined;
  const viewer = currentUserId
    ? { userId: currentUserId, groupIds: currentUserGroupIds }
    : undefined;
  const visible = entries.filter((entry) =>
    matchesArchiveFilters(entry, archiveFilters, query, viewer),
  );
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const calculatedUrgencyCounts = visible.reduce((counts, entry) => {
    counts[(entry.task ?? entry.list ?? entry.parentList!).urgency] += 1;
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
            groups={groups}
            {...(currentUserId ? { currentUserId } : {})}
            currentUserGroupIds={currentUserGroupIds}
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
                <th scope="col">Archived</th>
                <th scope="col">Category</th>
                <th scope="col">Project</th>
                <th scope="col">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((entry) => {
                const value = entry.task ?? entry.list ?? entry.parentList!;
                const project = value.projectId ? projectsById.get(value.projectId) : undefined;
                const categoryId =
                  entry.task?.categoryId ??
                  entry.list?.categoryId ??
                  entry.parentList?.categoryId ??
                  project?.categoryId;
                const category = categoryId ? categoriesById.get(categoryId) : undefined;
                const archivedAt = entry.listItem?.updatedAt ?? value.archivedAt;
                const label =
                  entry.task?.label ??
                  entry.list?.name ??
                  entry.listItem?.nameOverride ??
                  entry.listItem?.directorySnapshot.name ??
                  'work';
                return (
                  <tr key={`${entry.kind}:${entry.listItem?.id ?? value.id}`}>
                    <th className="archive-work-cell" scope="row">
                      <h2>{label}</h2>
                      <span className="archive-kind">
                        {entry.kind === 'task'
                          ? 'To-do'
                          : entry.kind === 'listItem'
                            ? `List item · ${entry.parentList?.name ?? 'Unknown list'}`
                            : 'List'}
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
                          {entry.items
                            .map((item) => item.nameOverride ?? item.directorySnapshot.name)
                            .join(', ')}
                        </span>
                      ) : null}
                    </th>
                    <td>
                      <UrgencyBadge urgency={value.urgency} />
                    </td>
                    <td>
                      {archivedAt ? (
                        <time
                          dateTime={archivedAt}
                          title={new Date(archivedAt).toLocaleString('en-US', { hour12: true })}
                        >
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
                          {entry.kind === 'listItem' ? 'Restore item' : 'Restore'}
                        </button>
                        {entry.kind !== 'listItem' ? (
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
                        ) : null}
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
