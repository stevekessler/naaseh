import type { List, ListItem } from '@naaseh/domain';
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
