import type { CategoryRecord, List, ListItem, Project } from '@naaseh/domain';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';
import { ListIndexColumnSettings, useListIndexColumns } from './ListIndexColumnSettings.js';

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
  const columns = useListIndexColumns();
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const projectRecords = new Map(projects.map((project) => [project.id, project]));
  if (!active.length) return null;
  return (
    <div className="list-index">
      <div className="list-index-tools">
        <p>
          {active.length} list{active.length === 1 ? '' : 's'}
        </p>
        <ListIndexColumnSettings {...columns} />
      </div>
      <div className="task-table-wrap list-index-table-wrap">
        <table className="task-list list-index-table" aria-label="Authorized lists">
          <thead>
            <tr>
              <th scope="col">List</th>
              {columns.visible.has('category') && <th scope="col">Category</th>}
              {columns.visible.has('project') && <th scope="col">Project</th>}
              {columns.visible.has('items') && <th scope="col">Items</th>}
              {columns.visible.has('priority') && <th scope="col">Priority</th>}
              {columns.visible.has('actions') && <th scope="col">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {active.map((list) => {
              const project = list.projectId ? projectRecords.get(list.projectId) : undefined;
              const categoryId = list.categoryId ?? project?.categoryId;
              const count = (items.get(list.id) ?? []).filter(
                (item) => item.status !== 'removed',
              ).length;
              return (
                <tr key={list.id} aria-current={list.id === selectedId ? 'page' : undefined}>
                  <th scope="row" data-label="List">
                    {list.locked ? <span aria-label="Locked">{'🔒 '}</span> : null}
                    {list.name}
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
      </div>
    </div>
  );
}
