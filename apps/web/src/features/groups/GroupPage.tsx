import { useState } from 'react';
import type { GroupView } from '@naaseh/domain';
import { CreateGroupDialog } from './CreateGroupDialog.js';
import { JoinGroupDialog } from './JoinGroupDialog.js';

export function GroupPage({
  groups,
  online,
  create,
  join,
}: {
  groups: GroupView[];
  online: boolean;
  create: (name: string, pin?: string) => Promise<void>;
  join: (group: GroupView, pin?: string) => Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<GroupView>();
  return (
    <section className="groups-page" aria-labelledby="groups-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Collaboration</p>
          <h1 id="groups-title">Groups</h1>
        </div>
        <button disabled={!online} onClick={() => setCreating(true)}>
          Create group
        </button>
      </div>
      {!online && (
        <p role="status">Offline: showing saved group status. Join and create require Internet.</p>
      )}
      {!groups.length ? (
        <p className="empty">No groups are available yet.</p>
      ) : (
        <ul className="group-list">
          {groups.map((group) => (
            <li key={group.id}>
              <div>
                <h2>{group.name}</h2>
                <p>
                  {group.hasJoinPin ? 'PIN required' : 'Open join'} ·{' '}
                  {group.joined ? `Active ${group.role ?? 'member'}` : 'Not joined'}
                </p>
              </div>
              {!group.joined && (
                <button disabled={!online} onClick={() => setJoining(group)}>
                  Join
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {creating && <CreateGroupDialog create={create} close={() => setCreating(false)} />}
      {joining && (
        <JoinGroupDialog
          group={joining}
          join={(pin) => join(joining, pin)}
          close={() => setJoining(undefined)}
        />
      )}
    </section>
  );
}
