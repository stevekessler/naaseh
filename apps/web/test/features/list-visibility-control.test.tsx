// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createList } from '@naaseh/domain';
import { ListVisibilityControl } from '../../src/features/lists/ListVisibilityControl.js';

afterEach(cleanup);

describe('list sharing draft', () => {
  it('keeps edits local until Save sharing is selected', async () => {
    const change = vi.fn().mockResolvedValue(undefined);
    const list = { ...createList({ name: 'Books' }, 'owner'), locked: true };
    const view = render(<ListVisibilityControl list={list} change={change} />);

    fireEvent.click(view.getByRole('button', { name: 'Unlock list' }));
    expect(view.getByText('Draft sharing changes.')).toBeTruthy();
    expect(change).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole('button', { name: 'Save sharing' }));
    await waitFor(() => expect(change).toHaveBeenCalledWith({ locked: false, groupId: null }));
  });

  it('reports a failed save without discarding the draft', async () => {
    const change = vi.fn().mockRejectedValue(new Error('Network unavailable'));
    const list = { ...createList({ name: 'Books' }, 'owner'), locked: true };
    const view = render(<ListVisibilityControl list={list} change={change} />);

    fireEvent.click(view.getByRole('button', { name: 'Unlock list' }));
    fireEvent.click(view.getByRole('button', { name: 'Save sharing' }));
    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toContain('Network unavailable'),
    );
    expect(view.getByText('Sharing was not saved.')).toBeTruthy();
  });
});
