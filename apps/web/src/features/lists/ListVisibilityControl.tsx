import type { List } from '@naaseh/domain';
import { ReferenceCombobox } from '../../components/ReferenceCombobox.js';
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
      {list.locked ? null : (
        <ReferenceCombobox
          label="Group"
          name="listGroup"
          {...(list.groupId ? { value: list.groupId } : {})}
          options={groups.map((group) => ({ id: group.id, label: group.name }))}
          onChange={(groupId) => change({ groupId: groupId || undefined })}
          clearLabel="Everyone"
        />
      )}
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
