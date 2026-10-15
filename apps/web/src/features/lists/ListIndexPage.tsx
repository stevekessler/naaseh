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
  if (!active.length) return null;
  return (
    <div className="task-table-wrap list-index-table-wrap">
      <table className="task-list list-index-table" aria-label="Authorized lists">
        <thead>
          <tr>
            <th scope="col">List</th>
            <th scope="col">Priority</th>
            <th scope="col" aria-label="Open list" />
          </tr>
        </thead>
        <tbody>
          {active.map((list) => (
            <tr key={list.id} aria-current={list.id === selectedId ? 'page' : undefined}>
              <th scope="row">
                {list.locked ? <span aria-label="Locked">{'🔒 '}</span> : null}
                {list.name}
              </th>
              <td>
                <UrgencyBadge urgency={list.urgency} />
              </td>
              <td>
                <button className="quiet" onClick={() => open(list)}>
                  Open
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
