// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';

vi.mock('../../src/db/database.js', () => ({
  db: {
    settings: {
      get: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}));
import {
  TaskColumnSettings,
  taskColumns,
  useTaskColumns,
} from '../../src/features/tasks/TaskColumnSettings.js';
import { TaskList } from '../../src/features/tasks/TaskList.js';

function Harness() {
  const columns = useTaskColumns();
  return <TaskColumnSettings {...columns} />;
}

const setWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  fireEvent(window, new Event('resize'));
};

beforeEach(() => {
  localStorage.clear();
  setWidth(500);
});

afterEach(cleanup);

describe('task column settings', () => {
  it('closes when the user clicks away', () => {
    const view = render(<Harness />);
    const settings = view.container.querySelector('details')!;
    fireEvent.click(view.getByText('Columns'));
    expect(settings.open).toBe(true);
    expect(view.getByText('Category').compareDocumentPosition(view.getByText('Project'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect((view.getByLabelText('Show Group column') as HTMLInputElement).checked).toBe(true);

    fireEvent.pointerDown(document.body);
    expect(settings.open).toBe(false);
  });

  it('keeps independent choices for phone and desktop layouts', () => {
    const view = render(<Harness />);
    fireEvent.click(view.getByText('Columns'));

    const phoneMemo = view.getByLabelText('Memo') as HTMLInputElement;
    expect(phoneMemo.checked).toBe(true);
    fireEvent.click(phoneMemo);
    expect(phoneMemo.checked).toBe(false);

    setWidth(1600);
    expect((view.getByLabelText('Memo') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(view.getByLabelText('Link'));
    expect((view.getByLabelText('Link') as HTMLInputElement).checked).toBe(false);

    setWidth(500);
    expect((view.getByLabelText('Memo') as HTMLInputElement).checked).toBe(false);
    expect((view.getByLabelText('Link') as HTMLInputElement).checked).toBe(true);
  });

  it('renders a configured group column with the task group name', () => {
    const task = createTask({ label: 'Grouped task', groupId: 'family' }, 'steve');
    const html = renderToStaticMarkup(
      <TaskList
        tasks={[task]}
        groups={[{ id: 'family', name: 'Family' }]}
        visibleColumns={new Set(taskColumns.map(({ id }) => id))}
        onToggle={() => undefined}
        onProgressChange={() => undefined}
      />,
    );

    expect(html).toContain('class="task-group-cell" scope="col">Group</th>');
    expect(html).toContain('class="task-group-cell">Family</td>');
  });

  it('hides tasks more than three months ahead until the user asks to view them', () => {
    const dateKey = (date: Date) =>
      `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const nearDate = new Date();
    nearDate.setMonth(nearDate.getMonth() + 2);
    const farDate = new Date();
    farDate.setMonth(farDate.getMonth() + 4);
    const near = createTask(
      { label: 'Near task', dueKind: 'date', dueDate: dateKey(nearDate) },
      'steve',
    );
    const far = createTask(
      { label: 'Far task', dueKind: 'date', dueDate: dateKey(farDate) },
      'steve',
    );
    const view = render(
      <TaskList
        tasks={[near, far]}
        collapseFutureTasks
        visibleColumns={new Set(taskColumns.map(({ id }) => id))}
        onToggle={() => undefined}
        onProgressChange={() => undefined}
      />,
    );

    expect(view.getByText('Near task')).toBeTruthy();
    expect(view.queryByText('Far task')).toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'View 1 more task' }));
    expect(view.getByText('Far task')).toBeTruthy();
  });
});
