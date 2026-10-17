// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import { CombinedSearchPage } from '../../src/features/search/CombinedSearchPage.js';

afterEach(() => {
  cleanup();
  history.replaceState(null, '', '/search');
});

describe('combined search scope', () => {
  it('defaults to the viewer and their groups and can search all readable content', async () => {
    const mine = createTask({ label: 'Task mine', assigneeId: 'viewer' }, 'owner');
    const theirs = createTask({ label: 'Task theirs', assigneeId: 'alex' }, 'alex');
    const view = render(
      <CombinedSearchPage
        tasks={[mine, theirs]}
        lists={[]}
        items={new Map()}
        directory={[]}
        categories={[]}
        projects={[]}
        currentUserId="viewer"
        currentUserGroupIds={[]}
        openTask={vi.fn()}
        openList={vi.fn()}
      />,
    );
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'Task' } });
    await waitFor(() => expect(view.getByRole('button', { name: 'Task mine' })).toBeTruthy());
    expect(view.queryByRole('button', { name: 'Task theirs' })).toBeNull();

    fireEvent.click(view.getByRole('checkbox', { name: 'All content' }));
    await waitFor(() => expect(view.getByRole('button', { name: 'Task theirs' })).toBeTruthy());
    expect(location.search).toBe('?scope=all');
  });
});
