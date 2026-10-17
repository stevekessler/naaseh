import type { List } from '@naaseh/domain';
import { useEffect, useState } from 'react';
import { ReferenceCombobox } from '../../components/ReferenceCombobox.js';
import type { LocalListPatch } from '../../db/list-repository.js';

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'pending' | 'conflict' | 'failed';

export function ListVisibilityControl({
  list,
  groups = [],
  change,
}: {
  list: List;
  groups?: { id: string; name: string }[];
  change: (patch: LocalListPatch) => Promise<void>;
}) {
  const [locked, setLocked] = useState(list.locked);
  const [groupId, setGroupId] = useState(list.groupId ?? '');
  const [state, setState] = useState<SaveState>('clean');
  const [message, setMessage] = useState('');
  useEffect(() => {
    setLocked(list.locked);
    setGroupId(list.groupId ?? '');
    setState((current) => (current === 'pending' || current === 'saved' ? current : 'clean'));
  }, [list.id, list.version, list.locked, list.groupId]);
  const dirty = locked !== list.locked || (!locked && groupId !== (list.groupId ?? ''));
  const markDirty = () => {
    setState('dirty');
    setMessage('');
  };
  const save = async () => {
    if (!dirty || state === 'saving') return;
    setState('saving');
    setMessage('');
    try {
      await change({ locked, groupId: locked || !groupId ? null : groupId });
      setState(navigator.onLine ? 'saved' : 'pending');
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Unable to save sharing.';
      setState(/conflict|changed|version/i.test(text) ? 'conflict' : 'failed');
      setMessage(text);
    }
  };
  const reset = () => {
    setLocked(list.locked);
    setGroupId(list.groupId ?? '');
    setState('clean');
    setMessage('');
  };
  const status = dirty
    ? state === 'saving'
      ? 'Saving sharing…'
      : state === 'conflict'
        ? 'Conflict — reload and review.'
        : state === 'failed'
          ? 'Sharing was not saved.'
          : 'Draft sharing changes.'
    : state === 'pending'
      ? 'Pending synchronization.'
      : state === 'saved'
        ? 'Sharing saved.'
        : 'Sharing is up to date.';

  return (
    <fieldset className="list-visibility-control">
      <legend>Who can see this list?</legend>
      <button
        type="button"
        aria-label={locked ? 'Unlock list' : 'Lock list'}
        aria-pressed={locked}
        onClick={() => {
          setLocked((current) => !current);
          markDirty();
        }}
      >
        {locked ? '🔒 Locked' : '🔓 Unlocked'}
      </button>
      {locked ? null : (
        <ReferenceCombobox
          label="Share with group"
          name="listGroup"
          {...(groupId ? { value: groupId } : {})}
          options={groups.map((group) => ({ id: group.id, label: group.name }))}
          onChange={(nextGroupId) => {
            setGroupId(nextGroupId);
            markDirty();
          }}
          clearLabel="Everyone with an account"
        />
      )}
      <p>
        {locked
          ? 'Only you can see this list.'
          : groupId
            ? 'Only active group members can see this list.'
            : 'All active users can see this list.'}
      </p>
      <p role="status">{status}</p>
      {message ? <p role="alert">{message}</p> : null}
      <div className="dialog-actions">
        <button type="button" disabled={!dirty || state === 'saving'} onClick={() => void save()}>
          {state === 'saving' ? 'Saving…' : 'Save sharing'}
        </button>
        <button type="button" className="quiet" disabled={!dirty} onClick={reset}>
          Cancel
        </button>
      </div>
    </fieldset>
  );
}
