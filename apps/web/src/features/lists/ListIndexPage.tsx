import type { List } from '@naaseh/domain';
import { UrgencyBadge } from '../../components/UrgencyBadge.js';

export function ListIndexPage({
  lists,
  selectedId,
  open,
}: {
  lists: List[];
  selectedId?: string;
  open: (list: List) => void;
}) {
  const active = lists.filter((list) => list.status === 'active');
  if (!active.length) return <p>No authorized lists are available.</p>;
  return (
    <nav aria-label="Authorized lists">
      <ul>
        {active.map((list) => (
          <li key={list.id}>
            <button
              className="quiet"
              aria-current={list.id === selectedId ? 'page' : undefined}
              onClick={() => open(list)}
            >
              {list.locked ? '🔒 ' : ''}
              {list.name}
            </button>
            <UrgencyBadge urgency={list.urgency} />
          </li>
        ))}
      </ul>
    </nav>
  );
}
