import type { List } from '@naaseh/domain';
export function ListVisibilityControl({
  list,
  groups = [],
  change,
}: {
  list: List;
  groups?: { id: string; name: string }[];
  change: (patch: Partial<List>) => void;
}) {
  return (
    <fieldset>
      <legend>Visibility</legend>
      <button
        aria-label={list.locked ? 'Unlock list' : 'Lock list'}
        aria-pressed={list.locked}
        onClick={() => change({ locked: !list.locked })}
      >
        {list.locked ? '🔒 Locked' : '🔓 Unlocked'}
      </button>
      <label>
        Group
        <select
          disabled={list.locked}
          value={list.groupId ?? ''}
          onChange={(event) => change({ groupId: event.target.value || undefined })}
        >
          <option value="">Everyone</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <p>
        {list.locked
          ? 'Only you can see this list.'
          : list.groupId
            ? 'Only active group members can see this list.'
            : 'All active users can see this list.'}
      </p>
    </fieldset>
  );
}
