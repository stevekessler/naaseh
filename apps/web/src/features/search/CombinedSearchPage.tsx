import {
  urgencyLabels,
  type CategoryRecord,
  type GlobalDirectoryItem,
  type List,
  type ListItem,
  type Project,
  type Task,
} from '@naaseh/domain';
import { useMemo, useState } from 'react';
import { formatDueValue } from '../tasks/due-value.js';
import {
  CombinedSearchColumnSettings,
  combinedSearchColumns,
  useCombinedSearchColumns,
} from './CombinedSearchColumnSettings.js';
import { buildCombinedSearchRows } from './combined-search.js';

export function CombinedSearchPage({
  tasks,
  lists,
  items,
  directory,
  categories,
  projects,
  openTask,
  openList,
}: {
  tasks: readonly Task[];
  lists: readonly List[];
  items: ReadonlyMap<string, readonly ListItem[]>;
  directory: readonly GlobalDirectoryItem[];
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  openTask: (taskId: string) => void;
  openList: (listId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const columns = useCombinedSearchColumns();
  const results = useMemo(
    () => buildCombinedSearchRows({ query, tasks, lists, items, directory, categories, projects }),
    [query, tasks, lists, items, directory, categories, projects],
  );
  const hiddenClasses = combinedSearchColumns
    .filter(({ id }) => !columns.visible.has(id))
    .map(({ id }) => `hide-${id}`)
    .join(' ');

  return (
    <section className="combined-search-page" aria-labelledby="combined-search-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Tasks and lists</p>
          <h1 id="combined-search-heading">Search all work</h1>
          <p>Find active tasks and list items by title, memo, list, category, or project.</p>
        </div>
      </header>
      <label className="search combined-search-input">
        <span>Search tasks and list items</span>
        <input
          type="search"
          autoFocus
          placeholder="Title, memo, list, category, or project"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span role="status" aria-live="polite">
          {query.trim()
            ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
            : 'Enter a search term'}
        </span>
      </label>
      <div className="task-list-toolbar combined-search-toolbar">
        <p>
          {results.length} {results.length === 1 ? 'result' : 'results'}
        </p>
        <CombinedSearchColumnSettings {...columns} />
      </div>
      <div className="task-table-wrap">
        <table className={`combined-search-table ${hiddenClasses}`} aria-label="Search results">
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th className="search-type-cell" scope="col">
                Type
              </th>
              <th className="search-list-cell" scope="col">
                List
              </th>
              <th className="search-category-cell" scope="col">
                Category
              </th>
              <th className="search-project-cell" scope="col">
                Project
              </th>
              <th className="search-memo-cell" scope="col">
                Memo
              </th>
              <th className="search-due-cell" scope="col">
                Due date
              </th>
              <th className="search-priority-cell" scope="col">
                Priority
              </th>
              <th className="search-status-cell" scope="col">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((row) => (
              <tr key={`${row.kind}:${row.id}`}>
                <th scope="row" className="search-title-cell">
                  <button
                    type="button"
                    className="task-link"
                    onClick={() =>
                      row.kind === 'task' ? openTask(row.id) : row.listId && openList(row.listId)
                    }
                  >
                    {row.title}
                  </button>
                </th>
                <td className="search-type-cell" data-label="Type">
                  {row.kind === 'task' ? 'Task' : 'List item'}
                </td>
                <td className="search-list-cell" data-label="List">
                  {row.listName ?? '—'}
                </td>
                <td className="search-category-cell" data-label="Category">
                  {row.categoryName ?? '—'}
                </td>
                <td className="search-project-cell" data-label="Project">
                  {row.projectName ?? '—'}
                </td>
                <td className="search-memo-cell" data-label="Memo">
                  {row.memo ?? '—'}
                </td>
                <td className="search-due-cell" data-label="Due date">
                  {formatDueValue(row.dueAt, row.dueDate) || '—'}
                </td>
                <td className="search-priority-cell" data-label="Priority">
                  {urgencyLabels[row.urgency]}
                </td>
                <td className="search-status-cell" data-label="Status">
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.trim() && !results.length ? (
          <p className="combined-search-empty">No tasks or list items match “{query.trim()}”.</p>
        ) : !query.trim() ? (
          <p className="combined-search-empty">Start typing to search your work.</p>
        ) : null}
      </div>
    </section>
  );
}
