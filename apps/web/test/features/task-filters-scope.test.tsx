// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import { TaskFilters } from '../../src/features/search/TaskFilters.js';

afterEach(cleanup);

const filters = {
  query: '',
  from: '',
  to: '',
  assigneeId: '',
  assigneeIds: ['steve'],
  groupIds: [],
  match: 'all' as const,
  scope: 'default' as const,
  categoryId: '',
  projectId: '',
  lifecycle: 'active' as const,
  contentType: 'all' as const,
  urgencies: ['critical' as const],
};

describe('task people and group filters', () => {
  it('offers an intuitive all/any choice and summarizes the expression', () => {
    const change = vi.fn();
    const parent = createTask({ label: 'Parent with children' }, 'steve');
    const child = { ...createTask({ label: 'Child task' }, 'steve'), parentId: parent.id };
    const unrelated = createTask({ label: 'No children' }, 'steve');
    const view = render(
      <TaskFilters
        tasks={[parent, child, unrelated]}
        value={filters}
        change={change}
        assignees={[{ id: 'steve', displayName: 'Steve' }]}
        groups={[{ id: 'family', name: 'Family' }]}
        currentUserId="steve"
        currentUserGroupIds={['family']}
      />,
    );
    const parentSelect = view.getByRole('combobox', { name: 'Parent task' });
    expect(parentSelect.textContent).toBe('All parent tasksParent with children');
    fireEvent.change(parentSelect, { target: { value: parent.id } });
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ parentId: parent.id }));
    expect(view.getByText('Assignee is Steve AND Priority is critical')).toBeTruthy();
    fireEvent.click(view.getByRole('radio', { name: 'Match any condition' }));
    expect(change).toHaveBeenCalledWith(expect.objectContaining({ match: 'any' }));
  });

  it('shows when a cross-user condition expands beyond the default scope', () => {
    const view = render(
      <TaskFilters
        value={{ ...filters, assigneeIds: ['heather'] }}
        change={vi.fn()}
        assignees={[{ id: 'heather', displayName: 'Heather' }]}
        currentUserId="steve"
        currentUserGroupIds={[]}
      />,
    );
    expect(view.getByRole('status').textContent).toBe('Searching all readable content.');
  });
});
