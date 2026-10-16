import { useState } from 'react';

export interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  active: boolean;
  sessionEpoch: number;
  version?: number;
  tfaStatus?: 'disabled' | 'enrollment_required' | 'enabled' | 'recovery_required';
  groupSummary?: readonly string[];
}

export function UsersAdminPage({
  users,
  currentUserId,
  toggle,
  create,
  update,
  online,
  nextCursor,
  loadMore,
}: {
  users: AdminUser[];
  currentUserId: string;
  toggle: (id: string, active: boolean, version?: number) => Promise<void>;
  create: (input: {
    username: string;
    displayName: string;
    password: string;
    pin: string;
    role: 'user' | 'admin';
  }) => Promise<void>;
  update: (
    id: string,
    input: {
      username: string;
      displayName: string;
      role: 'user' | 'admin';
      password?: string;
      confirmPassword?: string;
    },
    version?: number,
  ) => Promise<void>;
  online: boolean;
  nextCursor?: string;
  loadMore?: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser>();
  return (
    <section aria-labelledby="users-admin-heading">
      <h1 id="users-admin-heading">Users</h1>
      {error && <p role="alert">{error}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (!online) return;
          const form = event.currentTarget;
          const data = new FormData(form);
          if (data.get('password') !== data.get('confirmPassword')) {
            setError('Passwords must match.');
            return;
          }
          if (data.get('pin') !== data.get('confirmPin')) {
            setError('PINs must match.');
            return;
          }
          setCreating(true);
          setError('');
          void create({
            username: String(data.get('username') ?? ''),
            displayName: String(data.get('displayName') ?? ''),
            password: String(data.get('password') ?? ''),
            pin: String(data.get('pin') ?? ''),
            role: data.get('role') === 'admin' ? 'admin' : 'user',
          })
            .then(() => form.reset())
            .catch(() => setError('The user could not be created.'))
            .finally(() => setCreating(false));
        }}
      >
        <h2>Add user</h2>
        <p>Administration is online only. Passwords and PINs are sent once and are not retained.</p>
        <label>
          Username <input name="username" required autoComplete="off" />
        </label>
        <label>
          Display name <input name="displayName" required />
        </label>
        <label>
          Role
          <select name="role" defaultValue="user">
            <option value="user">User</option>
            <option value="admin">Administrator</option>
          </select>
        </label>
        <label>
          Password{' '}
          <input
            name="password"
            type="password"
            minLength={12}
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          PIN{' '}
          <input
            name="pin"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{6,12}"
            required
            autoComplete="new-password"
          />
        </label>
        <label>
          Confirm password
          <input name="confirmPassword" type="password" required autoComplete="new-password" />
        </label>
        <label>
          Confirm PIN
          <input
            name="confirmPin"
            type="password"
            inputMode="numeric"
            required
            autoComplete="new-password"
          />
        </label>
        <button disabled={!online || creating} type="submit">
          {creating ? 'Creating…' : 'Add user'}
        </button>
        {!online && <p role="status">Connect to the internet to administer users.</p>}
      </form>
      <div className="admin-user-table-scroll" tabIndex={0}>
        <table className="admin-user-table">
          <caption>System user accounts</caption>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Username</th>
              <th scope="col">Role</th>
              <th scope="col">Status</th>
              <th scope="col">TFA</th>
              <th scope="col">Groups</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const self = user.id === currentUserId;
              return (
                <tr key={user.id}>
                  <th scope="row">{user.displayName}</th>
                  <td>@{user.username}</td>
                  <td>{user.role === 'admin' ? 'Administrator' : 'User'}</td>
                  <td>{user.active ? 'Active' : 'Disabled'}</td>
                  <td>{user.tfaStatus?.replaceAll('_', ' ') ?? 'Not reported'}</td>
                  <td>{user.groupSummary?.join(', ') || 'None'}</td>
                  <td>
                    <button
                      disabled={busy === user.id || (self && user.active)}
                      aria-label={`${user.active ? 'Disable' : 'Reactivate'} ${user.displayName}`}
                      onClick={() => {
                        setBusy(user.id);
                        setError('');
                        void toggle(user.id, !user.active, user.version)
                          .catch(() => setError('The user status could not be changed.'))
                          .finally(() => setBusy(undefined));
                      }}
                    >
                      {busy === user.id ? 'Saving…' : user.active ? 'Disable' : 'Reactivate'}
                    </button>
                    <button type="button" onClick={() => setEditing(user)}>
                      Edit {user.displayName}
                    </button>
                    {self && user.active && (
                      <small>Your active administrator account cannot disable itself.</small>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {nextCursor && loadMore ? (
        <button
          type="button"
          disabled={!online || busy === 'page'}
          onClick={() => {
            setBusy('page');
            void loadMore().finally(() => setBusy(undefined));
          }}
        >
          {busy === 'page' ? 'Loading users…' : 'Load more users'}
        </button>
      ) : null}
      {editing ? (
        <dialog open aria-labelledby="edit-user-heading">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!online) return;
              const form = event.currentTarget;
              const data = new FormData(form);
              const password = String(data.get('password') ?? '');
              const confirmPassword = String(data.get('confirmPassword') ?? '');
              if (password !== confirmPassword) {
                setError('Passwords must match.');
                return;
              }
              setBusy(editing.id);
              setError('');
              void update(
                editing.id,
                {
                  username: String(data.get('username') ?? ''),
                  displayName: String(data.get('displayName') ?? ''),
                  role: data.get('role') === 'admin' ? 'admin' : 'user',
                  ...(password ? { password, confirmPassword } : {}),
                },
                editing.version,
              )
                .then(() => setEditing(undefined))
                .catch(() => setError('The user information could not be changed.'))
                .finally(() => setBusy(undefined));
            }}
          >
            <h2 id="edit-user-heading">Edit {editing.displayName}</h2>
            <p>Leave the password blank to keep the current password.</p>
            <label>
              Username <input name="username" defaultValue={editing.username} required />
            </label>
            <label>
              Display name <input name="displayName" defaultValue={editing.displayName} required />
            </label>
            <label>
              Role
              <select name="role" defaultValue={editing.role}>
                <option value="user">User</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label>
              New password
              <input name="password" type="password" minLength={12} autoComplete="new-password" />
            </label>
            <label>
              Confirm new password
              <input
                name="confirmPassword"
                type="password"
                minLength={12}
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={!online || busy === editing.id}>
              {busy === editing.id ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" onClick={() => setEditing(undefined)}>
              Cancel
            </button>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
