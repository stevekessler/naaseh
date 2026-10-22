import type { CategoryRecord, List, ListItem, Project } from '@naaseh/domain';
import { useState } from 'react';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { ListIndexColumnSettings, useListIndexColumns } from './ListIndexColumnSettings.js';
import { sortListsForTable, type ListIndexSortKey, type TableSort } from './list-table-sort.js';

const sortLabels: Record<ListIndexSortKey, string> = {
  name: 'List',
  category: 'Category',
  project: 'Project',
  items: 'Items',
  priority: 'Priority',
};

function SortableHeading({
  sortKey,
  sort,
  change,
}: {
  sortKey: ListIndexSortKey;
  sort: TableSort<ListIndexSortKey> | undefined;
  change: (key: ListIndexSortKey) => void;
}) {
  const active = sort?.key === sortKey;
  const nextDirection = active && sort.direction === 'ascending' ? 'descending' : 'ascending';
  return (
    <th scope="col" aria-label={sortLabels[sortKey]} aria-sort={active ? sort.direction : 'none'}>
      <button
        type="button"
        className="task-sort-button"
        aria-label={`Sort by ${sortLabels[sortKey]} ${nextDirection}`}
        onClick={() => change(sortKey)}
      >
        <span>{sortLabels[sortKey]}</span>
        <span aria-hidden="true">
          {active ? (sort.direction === 'ascending' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function ListIndexPage({
  lists,
  selectedId,
  open,
  items,
  categories,
  projects,
}: {
  lists: List[];
  selectedId?: string;
  open: (list: List) => void;
  items: ReadonlyMap<string, readonly ListItem[]>;
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
}) {
  const active = lists.filter((list) => list.status === 'active');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<TableSort<ListIndexSortKey>>();
  const columns = useListIndexColumns();
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projectRecords = new Map(projects.map((project) => [project.id, project]));
  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const categoryNamesByList = new Map(
    active.flatMap((list) => {
      const categoryId = list.categoryId ?? projectRecords.get(list.projectId ?? '')?.categoryId;
      const categoryName = categoryId ? categoryNames.get(categoryId) : undefined;
      return categoryName ? [[list.id, categoryName] as const] : [];
    }),
  );
  const itemCounts = new Map(
    active.map((list) => [
      list.id,
      (items.get(list.id) ?? []).filter((item) => item.status === 'open').length,
    ]),
  );
  const visible = sortListsForTable(
    filterListsByTitle(active, query),
    sort,
    itemCounts,
    categoryNamesByList,
    projectNames,
  );
  const changeSort = (key: ListIndexSortKey) =>
    setSort({
      key,
      direction: sort?.key === key && sort.direction === 'ascending' ? 'descending' : 'ascending',
    });
  if (!active.length) return null;
  return (
    <div className="list-index">
      <div className="list-index-tools">
        <label className="list-filter-field">
          <span>Filter lists by title</span>
          <input
            type="search"
            value={query}
            placeholder="Search list titles"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <p role="status">
          {query.trim() ? `${visible.length} of ` : ''}
          {active.length} list{active.length === 1 ? '' : 's'}
        </p>
        <ListIndexColumnSettings {...columns} />
      </div>
      <div className="task-table-wrap list-index-table-wrap">
        {sort ? (
          <div className="task-sort-toolbar" role="status">
            <span>
              Sorted by {sortLabels[sort.key]} {sort.direction}
            </span>
            <button type="button" className="quiet" onClick={() => setSort(undefined)}>
              Reset sort
            </button>
          </div>
        ) : null}
        <table className="task-list list-index-table" aria-label="Authorized lists">
          <thead>
            <tr>
              <SortableHeading sortKey="name" sort={sort} change={changeSort} />
              {columns.visible.has('category') && (
                <SortableHeading sortKey="category" sort={sort} change={changeSort} />
              )}
              {columns.visible.has('project') && (
                <SortableHeading sortKey="project" sort={sort} change={changeSort} />
              )}
              {columns.visible.has('items') && (
                <SortableHeading sortKey="items" sort={sort} change={changeSort} />
              )}
              {columns.visible.has('priority') && (
                <SortableHeading sortKey="priority" sort={sort} change={changeSort} />
              )}
              {columns.visible.has('actions') && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.map((list) => {
              const project = list.projectId ? projectRecords.get(list.projectId) : undefined;
              const categoryId = list.categoryId ?? project?.categoryId;
              const count = itemCounts.get(list.id) ?? 0;
              return (
                <tr key={list.id} aria-current={list.id === selectedId ? 'page' : undefined}>
                  <th scope="row" data-label="List">
                    <button className="quiet list-title-button" onClick={() => open(list)}>
                      {list.locked ? <span aria-label="Locked">{'🔒 '}</span> : null}
                      {list.name}
                    </button>
                  </th>
                  {columns.visible.has('category') && (
                    <td data-label="Category">
                      {categoryId ? (categoryNames.get(categoryId) ?? '—') : '—'}
                    </td>
                  )}
                  {columns.visible.has('project') && (
                    <td data-label="Project">{project?.name ?? '—'}</td>
                  )}
                  {columns.visible.has('items') && <td data-label="Items">{count}</td>}
                  {columns.visible.has('priority') && (
                    <td data-label="Priority">
                      <UrgencyBadge urgency={list.urgency} />
                    </td>
                  )}
                  {columns.visible.has('actions') && (
                    <td className="list-index-actions" data-label="Actions">
                      <button className="quiet" onClick={() => open(list)}>
                        Open
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length && <p className="list-filter-empty">No lists match “{query.trim()}”.</p>}
      </div>
    </div>
  );
}

export function filterListsByTitle(lists: readonly List[], query: string) {
  const normalized = query.normalize('NFKC').trim().toLocaleLowerCase();
  if (!normalized) return [...lists];
  return lists.filter((list) =>
    list.name.normalize('NFKC').toLocaleLowerCase().includes(normalized),
  );
}
