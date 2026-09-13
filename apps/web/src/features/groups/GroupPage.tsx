import { UserAvatar } from '../profile/user-directory.js';
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
  const [members, setMembers] = useState<Record<string, string[]>>({});
  const [memberError, setMemberError] = useState('');
  const [loadingGroup, setLoadingGroup] = useState('');
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
              {group.joined && (
                <div>
                  <button
                    disabled={!online || loadingGroup === group.id}
                    onClick={() => {
                      setLoadingGroup(group.id);
                      setMemberError('');
                      void fetch(`/api/v1/groups/${encodeURIComponent(group.id)}`, {
                        credentials: 'include',
                        cache: 'no-store',
                      })
                        .then(async (response) => {
                          if (!response.ok) throw new Error('members');
                          const result = (await response.json()) as {
                            members: { userId: string }[];
                          };
                          setMembers((current) => ({
                            ...current,
                            [group.id]: result.members.map((member) => member.userId),
                          }));
                        })
                        .catch(() => setMemberError('Group members could not be loaded.'))
                        .finally(() => setLoadingGroup(''));
                    }}
                  >
                    Show members
                  </button>
                  {members[group.id] && (
                    <ul aria-label={`${group.name} members`}>
                      {members[group.id]!.map((userId) => (
                        <li key={userId}>
                          <UserAvatar userId={userId} showName />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {!group.joined && (
                <button disabled={!online} onClick={() => setJoining(group)}>
                  Join
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {memberError && <p role="alert">{memberError}</p>}
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
