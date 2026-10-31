import {
  urgencyLabels,
  type CategoryRecord,
  type GlobalDirectoryItem,
  type List,
  type ListItem,
  type Project,
  type Task,
} from '@naaseh/domain';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FinanceSearchIndex,
  loadAuthorizedFinanceSearchSource,
  registerFinanceSearchIndex,
  type FinanceIndexProgress,
  type FinanceSearchSource,
} from '../../search/finance-index.js';
import { formatDueValue } from '../tasks/due-value.js';
import {
  CombinedSearchColumnSettings,
  CombinedSearchTypeSettings,
  combinedSearchColumns,
  useCombinedSearchColumns,
} from './CombinedSearchColumnSettings.js';
import { buildCombinedSearchRows } from './combined-search.js';
import { MixedSearchResultTitle, searchResultTypeLabel } from './SearchResults.js';
import {
  persistFinanceSearchPreferences,
  readFinanceSearchPreferences,
  safeFinanceSearchState,
  type FinanceSearchPreferences,
} from './search-state.js';

const emptyFinanceSource: FinanceSearchSource = { accounts: [], transactions: [], merchants: [] };

export function CombinedSearchPage({
  tasks,
  lists,
  items,
  directory,
  categories,
  projects,
  currentUserId,
  currentUserGroupIds,
  openTask,
  openList,
  loadFinanceSource = loadAuthorizedFinanceSearchSource,
}: {
  tasks: readonly Task[];
  lists: readonly List[];
  items: ReadonlyMap<string, readonly ListItem[]>;
  directory: readonly GlobalDirectoryItem[];
  categories: readonly CategoryRecord[];
  projects: readonly Project[];
  currentUserId: string;
  currentUserGroupIds: readonly string[];
  openTask: (taskId: string) => void;
  openList: (listId: string) => void;
  loadFinanceSource?: () => Promise<FinanceSearchSource>;
}) {
  const [query, setQuery] = useState('');
  const [allContent, setAllContent] = useState(
    () => new URLSearchParams(location.search).get('scope') === 'all',
  );
  const [preferences, setPreferences] = useState(readFinanceSearchPreferences);
  const [financeSource, setFinanceSource] = useState(emptyFinanceSource);
  const [financeProgress, setFinanceProgress] = useState<FinanceIndexProgress>({
    indexed: 0,
    total: 0,
    complete: false,
  });
  const [financeError, setFinanceError] = useState(false);
  const financeIndex = useRef(new FinanceSearchIndex());
  const columns = useCombinedSearchColumns();

  useEffect(() => registerFinanceSearchIndex(financeIndex.current), []);
  useEffect(() => {
    let active = true;
    void loadFinanceSource()
      .then((source) => {
        if (!active) return;
        setFinanceSource(source);
        setFinanceError(false);
        return financeIndex.current.replaceProgressively(source, {
          onProgress: (progress) => {
            if (active) setFinanceProgress(progress);
          },
        });
      })
      .catch(() => {
        if (active) {
          financeIndex.current.clear();
          setFinanceSource(emptyFinanceSource);
          setFinanceProgress({ indexed: 0, total: 0, complete: true });
          setFinanceError(true);
        }
      });
    return () => {
      active = false;
      financeIndex.current.clear();
    };
  }, [loadFinanceSource]);

  useEffect(() => {
    if (!financeProgress.complete) return;
    if (
      preferences.accountId !== 'all' &&
      !financeSource.accounts.some(({ id }) => id === preferences.accountId)
    )
      updatePreferences({ accountId: 'all' });
  }, [financeProgress.complete, financeSource.accounts, preferences.accountId]);

  const updatePreferences = (patch: Partial<FinanceSearchPreferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      if (
        next.accountId !== 'all' &&
        !financeSource.accounts.some(({ id }) => id === next.accountId)
      )
        next.accountId = 'all';
      persistFinanceSearchPreferences(next);
      const safe = safeFinanceSearchState(next);
      const url = new URL(location.href);
      for (const name of ['tasks', 'lists', 'transactions', 'merchants', 'financeAccount']) {
        url.searchParams.delete(name);
      }
      for (const [name, value] of safe) url.searchParams.set(name, value);
      history.replaceState(history.state, '', url);
      return next;
    });
  };

  const scopedTasks = useMemo(
    () =>
      allContent
        ? tasks
        : tasks.filter(
            (task) =>
              task.assigneeId === currentUserId ||
              Boolean(task.groupId && currentUserGroupIds.includes(task.groupId)),
          ),
    [allContent, tasks, currentUserId, currentUserGroupIds],
  );
  const scopedLists = useMemo(
    () =>
      allContent
        ? lists
        : lists.filter(
            (list) =>
              list.ownerId === currentUserId ||
              Boolean(list.groupId && currentUserGroupIds.includes(list.groupId)),
          ),
    [allContent, lists, currentUserId, currentUserGroupIds],
  );
  const financeHits = useMemo(
    () =>
      query.trim()
        ? financeIndex.current.search(query, {
            includeTransactions: preferences.includeTransactions,
            includeMerchants: preferences.includeMerchants,
            accountId: preferences.accountId,
          })
        : [],
    [financeProgress.indexed, preferences, query],
  );
  const results = useMemo(
    () =>
      buildCombinedSearchRows({
        query,
        tasks: scopedTasks,
        lists: scopedLists,
        items,
        directory,
        categories,
        projects,
        preferences,
        financeHits,
      }),
    [
      query,
      scopedTasks,
      scopedLists,
      items,
      directory,
      categories,
      projects,
      preferences,
      financeHits,
    ],
  );
  const hiddenClasses = combinedSearchColumns
    .filter(({ id }) => !columns.visible.has(id))
    .map(({ id }) => `hide-${id}`)
    .join(' ');
  const financeEnabled = preferences.includeTransactions || preferences.includeMerchants;

  return (
    <section className="combined-search-page" aria-labelledby="combined-search-heading">
      <header className="section-heading">
        <div>
          <p className="eyebrow">Tasks, lists, and optional Finance results</p>
          <h1 id="combined-search-heading">Search all work</h1>
          <p>Choose exactly which content types to include. Finance results start turned off.</p>
        </div>
      </header>
      <label className="search combined-search-input">
        <span>Search selected content</span>
        <input
          type="search"
          autoFocus
          aria-label="Search tasks and list items"
          placeholder="Title, memo, list, category, merchant, or transaction"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span role="status" aria-live="polite">
          {query.trim()
            ? `${results.length} ${results.length === 1 ? 'result' : 'results'}`
            : 'Enter a search term'}
        </span>
      </label>
      <CombinedSearchTypeSettings
        preferences={preferences}
        accounts={financeSource.accounts}
        update={updatePreferences}
      />
      <label className="search-scope-toggle">
        <input
          type="checkbox"
          checked={allContent}
          onChange={(event) => {
            const checked = event.currentTarget.checked;
            setAllContent(checked);
            const url = new URL(location.href);
            if (checked) url.searchParams.set('scope', 'all');
            else url.searchParams.delete('scope');
            history.replaceState(history.state, '', url);
          }}
        />
        All content
      </label>
      <p role="status">
        Searching{' '}
        {allContent ? 'all readable task and list content' : 'my tasks, lists, and groups'}.
      </p>
      {financeEnabled && !financeProgress.complete ? (
        <p role="status" aria-live="polite">
          Indexing Finance results… {financeProgress.indexed} of {financeProgress.total}
        </p>
      ) : financeEnabled && financeError ? (
        <p role="alert">Finance search is unavailable. Tasks and lists remain searchable.</p>
      ) : financeEnabled ? (
        <p role="status">
          {navigator.onLine
            ? 'All Finance data synchronized to this browser is indexed.'
            : 'Offline results include all Finance data already synchronized to this browser.'}
        </p>
      ) : null}
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
                List or account
              </th>
              <th className="search-category-cell" scope="col">
                Category or location
              </th>
              <th className="search-project-cell" scope="col">
                Project
              </th>
              <th className="search-memo-cell" scope="col">
                Memo or amount
              </th>
              <th className="search-due-cell" scope="col">
                Due or transaction date
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
                  {row.kind === 'task' || row.kind === 'listItem' ? (
                    <button
                      type="button"
                      className="task-link"
                      onClick={() =>
                        row.kind === 'task' ? openTask(row.id) : row.listId && openList(row.listId)
                      }
                    >
                      {row.title}
                    </button>
                  ) : (
                    <MixedSearchResultTitle row={row} />
                  )}
                </th>
                <td className="search-type-cell" data-label="Type">
                  {searchResultTypeLabel(row.kind)}
                </td>
                <td className="search-list-cell" data-label="List or account">
                  {row.listName ?? row.accountName ?? '—'}
                </td>
                <td className="search-category-cell" data-label="Category or location">
                  {row.categoryName ?? row.location ?? '—'}
                </td>
                <td className="search-project-cell" data-label="Project">
                  {row.projectName ?? '—'}
                </td>
                <td className="search-memo-cell" data-label="Memo or amount">
                  {row.memo ?? row.amountLabel ?? '—'}
                </td>
                <td className="search-due-cell" data-label="Due or transaction date">
                  {formatDueValue(row.dueAt, row.dueDate) || '—'}
                </td>
                <td className="search-priority-cell" data-label="Priority">
                  {row.urgency ? urgencyLabels[row.urgency] : '—'}
                </td>
                <td className="search-status-cell" data-label="Status">
                  {row.status}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {query.trim() && !results.length ? (
          <p className="combined-search-empty">No selected content matches “{query.trim()}”.</p>
        ) : !query.trim() ? (
          <p className="combined-search-empty">
            Start typing to search the selected content types.
          </p>
        ) : null}
      </div>
    </section>
  );
}
