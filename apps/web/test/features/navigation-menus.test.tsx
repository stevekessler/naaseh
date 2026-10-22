// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TasksNavigation } from '../../src/components/TasksNavigation.js';

afterEach(cleanup);

describe('top-level task navigation', () => {
  it('opens My Tasks from the primary control and keeps menu choices on a separate touch target', () => {
    const navigate = vi.fn();
    render(<TasksNavigation section="archive" navigate={navigate} />);

    fireEvent.click(screen.getByRole('button', { name: 'Tasks' }));
    expect(navigate).toHaveBeenCalledWith('tasks');
    expect(screen.queryByText('Personal Stack')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show Tasks menu' }));
    expect(screen.getByText('Personal Stack')).toBeTruthy();
  });

  it('reveals the menu on mouse hover', () => {
    const view = render(<TasksNavigation section="tasks" navigate={vi.fn()} />);
    fireEvent.mouseEnter(view.container.firstElementChild!);
    expect(screen.getByText('Task Reporting')).toBeTruthy();
  });
});
