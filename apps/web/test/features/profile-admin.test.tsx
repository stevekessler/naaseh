import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UsersAdminPage } from '../../src/features/admin/UsersAdminPage.js';
import { ListVisibilityControl } from '../../src/features/lists/ListVisibilityControl.js';

describe('profile, administration, and authorized group controls', () => {
  it('renders users as a semantic responsive table with safe account summaries', () => {
    const html = renderToStaticMarkup(
      <UsersAdminPage
        users={[
          {
            id: 'admin',
            username: 'steve',
            displayName: 'Steve',
            role: 'admin',
            active: true,
            sessionEpoch: 1,
            version: 2,
            tfaStatus: 'enabled',
            groupSummary: ['group-a'],
          },
        ]}
        currentUserId="other"
        toggle={vi.fn()}
        create={vi.fn()}
        online
      />,
    );
    expect(html).toContain('<table');
    expect(html).toContain('<caption>System user accounts</caption>');
    expect(html).toContain('<th scope="row">Steve</th>');
    expect(html).toContain('class="admin-user-table-scroll"');
    expect(html).toContain('enabled');
    expect(html).toContain('group-a');
  });

  it('uses the shared authorized combobox for list groups', () => {
    const html = renderToStaticMarkup(
      <ListVisibilityControl
        list={{ locked: false, groupId: 'group-a' } as never}
        groups={[{ id: 'group-a', name: 'Joined group' }]}
        change={vi.fn()}
      />,
    );
    expect(html).toContain('class="reference-combobox"');
    expect(html).toContain('Joined group');
    expect(html).not.toContain('<select');
  });
});
