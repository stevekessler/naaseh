import type { List, ListItem } from '@naaseh/domain';
import type { CombinedSearchRow } from './combined-search.js';

export function MixedSearchResultTitle({ row }: { row: CombinedSearchRow }) {
  if (row.kind === 'transaction') {
    return <a href={`/finance/transactions/${encodeURIComponent(row.id)}`}>{row.title}</a>;
  }
  if (row.kind === 'merchant') {
    return <a href={`/finance/merchants/${encodeURIComponent(row.id)}`}>{row.title}</a>;
  }
  return null;
}

export function searchResultTypeLabel(kind: CombinedSearchRow['kind']) {
  if (kind === 'listItem') return 'List item';
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
export function SearchResults({
  lists,
  items,
  open,
}: {
  lists: List[];
  items: Map<string, ListItem[]>;
  open: (list: List) => void;
}) {
  if (!lists.length) return null;
  return (
    <section aria-label="List search results">
      <h2>Lists</h2>
      <ul>
        {lists.map((list) => (
          <li key={list.id}>
            <button className="task-link" onClick={() => open(list)}>
              <strong>{list.name}</strong>
              <span>
                {' '}
                — {
                  (items.get(list.id) ?? []).filter((item) => item.status !== 'removed').length
                }{' '}
                items
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
