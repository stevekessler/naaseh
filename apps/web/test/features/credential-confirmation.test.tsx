// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { JournalUnlock } from '../../src/features/journal/JournalUnlock.js';
import { JournalSettings } from '../../src/features/journal/JournalSettings.js';
import { UsersAdminPage } from '../../src/features/admin/UsersAdminPage.js';
import { CreateGroupDialog } from '../../src/features/groups/CreateGroupDialog.js';
afterEach(cleanup);
it('requires matching first-time Journal PINs, but only one PIN when unlocking', async () => {
  const enroll = vi.fn().mockResolvedValue(undefined);
  const view = render(<JournalUnlock enrolled={false} onEnroll={enroll} onUnlock={vi.fn()} />);
  fireEvent.change(view.getByLabelText('Journal PIN'), { target: { value: '246810' } });
  fireEvent.change(view.getByLabelText('Confirm Journal PIN'), { target: { value: '123456' } });
  fireEvent.click(view.getByRole('button', { name: 'Create Journal' }));
  expect(enroll).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Confirm Journal PIN'), { target: { value: '246810' } });
  fireEvent.click(view.getByRole('button', { name: 'Create Journal' }));
  await waitFor(() => expect(enroll).toHaveBeenCalledWith('246810'));
  view.rerender(<JournalUnlock enrolled onEnroll={enroll} onUnlock={vi.fn()} />);
  expect(view.queryByLabelText('Confirm Journal PIN')).toBeNull();
});
it('prevents changing a Journal PIN until confirmation matches', async () => {
  const change = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <JournalSettings
      profile={{
        schemaVersion: 1,
        ownerId: 'steve',
        dbtSkillsEnabled: true,
        suicidalSelfHarmEnabled: true,
      }}
      onChange={vi.fn()}
      onLock={vi.fn()}
      onChangePin={change}
    />,
  );
  fireEvent.change(view.getByLabelText('Current PIN'), { target: { value: '123456' } });
  fireEvent.change(view.getByLabelText('New PIN'), { target: { value: '246810' } });
  fireEvent.change(view.getByLabelText('Confirm new PIN'), { target: { value: '999999' } });
  fireEvent.click(view.getByRole('button', { name: 'Change PIN' }));
  expect(change).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Confirm new PIN'), { target: { value: '246810' } });
  fireEvent.click(view.getByRole('button', { name: 'Change PIN' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith('123456', '246810'));
});
it('requires both password and account PIN confirmation before creating a user', async () => {
  const create = vi.fn().mockResolvedValue(undefined);
  const view = render(
    <UsersAdminPage users={[]} currentUserId="steve" online create={create} toggle={vi.fn()} />,
  );
  const fill = (label: string, value: string) =>
    fireEvent.change(view.getByLabelText(label), { target: { value } });
  fill('Username', 'alex');
  fill('Display name', 'Alex');
  fill('Password', 'long-password');
  fill('PIN', '246810');
  fill('Confirm password', 'different');
  fill('Confirm PIN', '123456');
  fireEvent.submit(view.getByRole('button', { name: 'Add user' }).closest('form')!);
  expect(create).not.toHaveBeenCalled();
  expect(view.getByRole('alert').textContent).toContain('Passwords must match');
  fill('Confirm password', 'long-password');
  fireEvent.submit(view.getByRole('button', { name: 'Add user' }).closest('form')!);
  expect(create).not.toHaveBeenCalled();
  expect(view.getByRole('alert').textContent).toContain('PINs must match');
  fill('Confirm PIN', '246810');
  fireEvent.submit(view.getByRole('button', { name: 'Add user' }).closest('form')!);
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'long-password', pin: '246810' }),
    ),
  );
});
it('checks an optional group PIN confirmation and permits no PIN', async () => {
  const create = vi.fn().mockResolvedValue(undefined);
  const view = render(<CreateGroupDialog create={create} close={vi.fn()} />);
  fireEvent.change(view.getByLabelText('Group name'), { target: { value: 'Friends' } });
  fireEvent.change(view.getByLabelText('Optional group PIN'), { target: { value: '246810' } });
  fireEvent.submit(view.getByRole('button', { name: 'Create group' }).closest('form')!);
  expect(create).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Confirm group PIN'), { target: { value: '246810' } });
  fireEvent.submit(view.getByRole('button', { name: 'Create group' }).closest('form')!);
  await waitFor(() => expect(create).toHaveBeenCalledWith('Friends', '246810'));
  fireEvent.change(view.getByLabelText('Optional group PIN'), { target: { value: '' } });
  fireEvent.change(view.getByLabelText('Confirm group PIN'), { target: { value: '' } });
  fireEvent.submit(view.getByRole('button', { name: 'Create group' }).closest('form')!);
  await waitFor(() => expect(create).toHaveBeenCalledWith('Friends', undefined));
});

const security = vi.hoisted(() => ({
  resetPassword: vi.fn(),
  changePassword: vi.fn(),
  readProfileSecurity: vi.fn(),
  disableTfa: vi.fn(),
  requestTfaEnrollment: vi.fn(),
  rotateRecoveryCodes: vi.fn(),
}));
vi.mock('../../src/features/auth/security-client.js', () => security);
const { Login } = await import('../../src/features/auth/Login.js');
const { SecuritySettings } = await import('../../src/features/profile/SecuritySettings.js');
it('prevents mismatched password reset requests', async () => {
  security.resetPassword.mockResolvedValue({ message: 'Reset complete' });
  const view = render(<Login onAuthenticated={vi.fn()} />);
  fireEvent.click(view.getByRole('button', { name: /forgot password/i }));
  fireEvent.change(view.getByLabelText('New password'), { target: { value: 'long-password' } });
  fireEvent.change(view.getByLabelText('Confirm new password'), { target: { value: 'different' } });
  fireEvent.submit(
    view.getByRole('button', { name: 'Reset password', exact: true }).closest('form')!,
  );
  expect(security.resetPassword).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Confirm new password'), {
    target: { value: 'long-password' },
  });
  fireEvent.submit(
    view.getByRole('button', { name: 'Reset password', exact: true }).closest('form')!,
  );
  await waitFor(() => expect(security.resetPassword).toHaveBeenCalledTimes(1));
});
it('requires matching changed passwords and resets the successful form', async () => {
  security.readProfileSecurity.mockResolvedValue({
    tfaStatus: 'enabled',
    recoveryCodesRemaining: 3,
  });
  security.changePassword.mockResolvedValue(undefined);
  const view = render(<SecuritySettings csrfToken="csrf" role="admin" />);
  await waitFor(() => expect(view.getByLabelText('New password')).toBeTruthy());
  fireEvent.change(view.getByLabelText('New password'), { target: { value: 'long-password' } });
  fireEvent.change(view.getByLabelText('Confirm new password'), { target: { value: 'different' } });
  fireEvent.submit(
    view.getByRole('button', { name: 'Change password', exact: true }).closest('form')!,
  );
  expect(security.changePassword).not.toHaveBeenCalled();
  fireEvent.change(view.getByLabelText('Confirm new password'), {
    target: { value: 'long-password' },
  });
  fireEvent.submit(
    view.getByRole('button', { name: 'Change password', exact: true }).closest('form')!,
  );
  await waitFor(() =>
    expect((view.getByLabelText('New password') as HTMLInputElement).value).toBe(''),
  );
  expect(security.changePassword).toHaveBeenCalledTimes(1);
});
