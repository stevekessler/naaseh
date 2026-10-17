// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GroupPage } from '../../src/features/groups/GroupPage.js';

afterEach(cleanup);

const group = {
  id: 'family',
  name: 'Family',
  joined: true,
  hasJoinPin: false,
  role: 'member',
} as never;

const props = {
  groups: [group],
  online: true,
  create: vi.fn(),
  join: vi.fn(),
  rename: vi.fn(),
  users: [],
  addMember: vi.fn(),
  removeMember: vi.fn(),
  deleteGroup: vi.fn(),
};

describe('group member rosters', () => {
  it('loads joined-group members automatically without a disclosure button', async () => {
    const read = vi.fn().mockResolvedValue([{ userId: 'alex', role: 'member' }]);
    const view = render(<GroupPage {...props} read={read} />);
    expect(view.queryByRole('button', { name: 'Show members' })).toBeNull();
    await waitFor(() => expect(view.getByLabelText('Family members')).toBeTruthy());
    expect(read).toHaveBeenCalledWith(group);
  });

  it('shows a per-group retry when automatic loading fails', async () => {
    const read = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([{ userId: 'alex', role: 'member' }]);
    const view = render(<GroupPage {...props} read={read} />);
    const retry = await view.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    await waitFor(() => expect(view.getByLabelText('Family members')).toBeTruthy());
    expect(read).toHaveBeenCalledTimes(2);
  });
});
