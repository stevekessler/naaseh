// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  UserAvatar,
  UserDirectoryContext,
  identicon,
} from '../../src/features/profile/user-directory.js';
import { ProfilePictureSettings } from '../../src/features/profile/ProfilePictureSettings.js';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it('uses a stable colorful default and falls back when a photo fails', () => {
  expect(identicon('a')).toEqual(identicon('a'));
  expect(identicon('a').color).not.toBe(identicon('b').color);
  const view = render(
    <UserDirectoryContext.Provider
      value={[
        { id: 'a', displayName: 'Alex', username: 'alex', pictureUrl: 'https://media.test/photo' },
      ]}
    >
      <UserAvatar userId="a" showName />
    </UserDirectoryContext.Provider>,
  );
  const picture = view.getByRole('img', { name: 'Alex' });
  expect(picture.tagName).toBe('IMG');
  fireEvent.error(picture);
  expect(view.getByRole('img', { name: 'Alex' }).tagName.toLowerCase()).toBe('svg');
});
it('rejects unsupported or oversized profile images before requesting an upload', () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const view = render(<ProfilePictureSettings userId="a" csrfToken="csrf" refresh={vi.fn()} />);
  fireEvent.change(view.getByLabelText('Upload profile photo'), {
    target: { files: [new File(['x'], 'x.svg', { type: 'image/svg+xml' })] },
  });
  expect(fetch).not.toHaveBeenCalled();
  expect(view.getByRole('status').textContent).toContain('up to 5 MB');
});
it('uploads using the authenticated self-service route and signed headers', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        uploadUrl: 'https://media.test/upload',
        headers: { 'content-type': 'image/png', 'content-length': '3' },
      }),
    })
    .mockResolvedValueOnce({ ok: true });
  vi.stubGlobal('fetch', fetch);
  const view = render(<ProfilePictureSettings userId="a" csrfToken="csrf" refresh={vi.fn()} />);
  const file = new File(['png'], 'avatar.png', { type: 'image/png' });
  fireEvent.change(view.getByLabelText('Upload profile photo'), { target: { files: [file] } });
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(fetch.mock.calls[0]![1].headers['x-csrf-token']).toBe('csrf');
  expect(JSON.parse(fetch.mock.calls[0]![1].body)).toEqual({
    contentType: 'image/png',
    contentLength: 3,
  });
  expect(fetch.mock.calls[1]![1]).toEqual({
    method: 'PUT',
    headers: { 'content-type': 'image/png' },
    body: file,
  });
});

const { GroupPage } = await import('../../src/features/groups/GroupPage.js');
it('shows group member avatars from the shared directory', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: async () => ({ members: [{ userId: 'alex' }] }) }),
  );
  const view = render(
    <UserDirectoryContext.Provider value={[{ id: 'alex', displayName: 'Alex', username: 'alex' }]}>
      <GroupPage
        groups={[
          { id: 'g', name: 'Friends', joined: true, hasJoinPin: true, role: 'member' } as never,
        ]}
        online
        create={vi.fn()}
        join={vi.fn()}
      />
    </UserDirectoryContext.Provider>,
  );
  fireEvent.click(view.getByRole('button', { name: 'Show members' }));
  await waitFor(() => expect(view.getByRole('img', { name: 'Alex' })).toBeTruthy());
});
