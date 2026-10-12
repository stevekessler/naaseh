import { UserAvatar, type DirectoryUser } from '../profile/user-directory.js';
import { useState } from 'react';
import type { GroupMembershipView, GroupView } from '@naaseh/domain';
import { CreateGroupDialog } from './CreateGroupDialog.js';
import { JoinGroupDialog } from './JoinGroupDialog.js';

export function GroupPage({
  groups,
  online,
  create,
  join,
  rename,
  users,
  read,
  addMember,
  removeMember,
  deleteGroup,
}: {
  groups: GroupView[];
  online: boolean;
  create: (name: string, pin?: string) => Promise<void>;
  join: (group: GroupView, pin?: string) => Promise<void>;
  rename: (group: GroupView, name: string) => Promise<void>;
  users: DirectoryUser[];
  read: (group: GroupView) => Promise<GroupMembershipView[]>;
  addMember: (group: GroupView, userId: string) => Promise<void>;
  removeMember: (group: GroupView, userId: string) => Promise<void>;
  deleteGroup: (group: GroupView) => Promise<void>;
}) {
  const [members, setMembers] = useState<Record<string, GroupMembershipView[]>>({});
  const [memberError, setMemberError] = useState('');
  const [loadingGroup, setLoadingGroup] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState<GroupView>();
  const [editing, setEditing] = useState<GroupView>();
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [addingTo, setAddingTo] = useState<GroupView>();
  const [selectedUserId, setSelectedUserId] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const loadMembers = async (group: GroupView) => {
    setLoadingGroup(group.id);
    setMemberError('');
    try {
      const result = await read(group);
      setMembers((current) => ({ ...current, [group.id]: result }));
    } catch {
      setMemberError('Group members could not be loaded.');
    } finally {
      setLoadingGroup('');
    }
  };
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
                  {group.role === 'owner' && (
                    <>
                      <button
                        type="button"
                        disabled={!online}
                        onClick={() => {
                          setEditing(group);
                          setEditName(group.name);
                          setEditError('');
                        }}
                      >
                        Edit group
                      </button>
                      <button
                        type="button"
                        disabled={!online}
                        onClick={() => {
                          setAddingTo(group);
                          setSelectedUserId('');
                          setMemberError('');
                          void loadMembers(group);
                        }}
                      >
                        Add user
                      </button>
                      <button
                        type="button"
                        className="danger"
                        disabled={!online || deletingId === group.id}
                        onClick={() => {
                          if (!confirm(`Delete ${group.name}? Members will lose group access.`))
                            return;
                          setDeletingId(group.id);
                          setMemberError('');
                          void deleteGroup(group)
                            .catch(() => setMemberError('The group could not be deleted.'))
                            .finally(() => setDeletingId(''));
                        }}
                      >
                        {deletingId === group.id ? 'Deleting…' : 'Delete group'}
                      </button>
                    </>
                  )}
                  <button
                    disabled={!online || loadingGroup === group.id}
                    onClick={() => void loadMembers(group)}
                  >
                    Show members
                  </button>
                  {members[group.id] && (
                    <ul aria-label={`${group.name} members`}>
                      {members[group.id]!.map((member) => (
                        <li key={member.userId}>
                          <UserAvatar userId={member.userId} showName />
                          {group.role === 'owner' && member.role !== 'owner' && (
                            <button
                              type="button"
                              className="quiet"
                              disabled={!online || memberBusy}
                              onClick={() => {
                                setMemberBusy(true);
                                setMemberError('');
                                void removeMember(group, member.userId)
                                  .then(() => loadMembers(group))
                                  .catch(() =>
                                    setMemberError('The group member could not be removed.'),
                                  )
                                  .finally(() => setMemberBusy(false));
                              }}
                            >
                              Remove
                            </button>
                          )}
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
      {editing && (
        <dialog open aria-label={`Edit group: ${editing.name}`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!editName.trim() || editBusy) return;
              setEditBusy(true);
              setEditError('');
              void rename(editing, editName.trim())
                .then(() => setEditing(undefined))
                .catch((error: Error) => setEditError(error.message || 'Unable to edit group.'))
                .finally(() => setEditBusy(false));
            }}
          >
            <h2>Edit group</h2>
            <label>
              Group name
              <input
                required
                maxLength={100}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </label>
            {editError && <p role="alert">{editError}</p>}
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setEditing(undefined)}>
                Cancel
              </button>
              <button disabled={editBusy}>{editBusy ? 'Saving…' : 'Save group'}</button>
            </div>
          </form>
        </dialog>
      )}
      {addingTo && (
        <dialog open aria-label={`Add user to ${addingTo.name}`}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!selectedUserId || memberBusy) return;
              setMemberBusy(true);
              setMemberError('');
              void addMember(addingTo, selectedUserId)
                .then(async () => {
                  await loadMembers(addingTo);
                  setAddingTo(undefined);
                })
                .catch(() => setMemberError('The user could not be added to this group.'))
                .finally(() => setMemberBusy(false));
            }}
          >
            <h2>Add user to {addingTo.name}</h2>
            <label>
              User
              <select
                required
                value={selectedUserId}
                onChange={(event) => setSelectedUserId(event.target.value)}
              >
                <option value="">Select a user</option>
                {users
                  .filter(
                    (user) =>
                      user.id !== addingTo.ownerId &&
                      !members[addingTo.id]?.some(
                        (member) => member.userId === user.id && member.status === 'active',
                      ),
                  )
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.displayName} (@{user.username.replace(/^@/, '')})
                    </option>
                  ))}
              </select>
            </label>
            {memberError && <p role="alert">{memberError}</p>}
            <div className="dialog-actions">
              <button type="button" className="quiet" onClick={() => setAddingTo(undefined)}>
                Cancel
              </button>
              <button disabled={!selectedUserId || memberBusy}>
                {memberBusy ? 'Adding…' : 'Add user'}
              </button>
            </div>
          </form>
        </dialog>
      )}
    </section>
  );
}
