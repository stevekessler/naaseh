// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import { FinanceItemPicker } from '../../src/features/tasks/FinanceItemPicker.js';
import { TaskColumnSettings, useTaskColumns } from '../../src/features/tasks/TaskColumnSettings.js';
import { PostItFieldSettings, usePostItFields } from '../../src/features/postit/PostItFieldSettings.js';
import { TaskList } from '../../src/features/tasks/TaskList.js';
import { PostItNote } from '../../src/features/postit/PostItNote.js';

vi.mock('../../src/db/database.js', () => ({ db: {} }));

const task = { ...createTask({ label: 'Review bills' }, 'owner'), id: 'task-1' };
const links = [
  { id: 'link-1', taskId: task.id, targetType: 'upcomingExpense' as const,
    targetId: 'expense-1', status: 'active' as const,
    upcomingExpense: { description: 'Rent', dueDate: '2027-01-05', expectedAmountMinor: 125000,
      currency: 'USD', currencyExponent: 2, accountName: 'Checking' } },
  { id: 'link-2', taskId: task.id, targetType: 'upcomingExpense' as const,
    targetId: 'expense-2', status: 'active' as const,
    upcomingExpense: { description: 'Insurance', dueDate: '2027-01-20', expectedAmountMinor: 10000,
      currency: 'USD', currencyExponent: 2, accountName: 'Savings' } },
];

function ColumnHarness() { return <TaskColumnSettings {...useTaskColumns()} />; }
function FieldHarness() { return <PostItFieldSettings {...usePostItFields()} />; }

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
});
afterEach(cleanup);

describe('optional Finance expense task displays', () => {
  it('keeps the task column and post-it field off by default and stores opt-in separately', () => {
    const columns = render(<ColumnHarness />);
    fireEvent.click(columns.getByText('Columns'));
    const column = columns.getByLabelText('Show Upcoming Expenses column') as HTMLInputElement;
    expect(column.checked).toBe(false);
    fireEvent.click(column);
    expect(localStorage.getItem('naaseh.task-columns.v1.desktop')).toContain('upcomingExpenses');
    columns.unmount();

    const fields = render(<FieldHarness />);
    fireEvent.click(fields.getByText('Fields'));
    const field = fields.getByLabelText('Show Upcoming Expenses on post-its') as HTMLInputElement;
    expect(field.checked).toBe(false);
  });

  it('shows authorized upcoming details and distinguishes several records in both views', () => {
    const html = renderToStaticMarkup(<TaskList
      tasks={[task]}
      visibleColumns={new Set(['upcomingExpenses'])}
      financialLinksByTask={new Map([[task.id, links]])}
      onToggle={() => undefined}
      onProgressChange={() => undefined}
    />);
    expect(html).toMatch(/Rent/);
    expect(html).toMatch(/2027-01-05/);
    expect(html).toMatch(/\$1,250\.00/);
    expect(html).toMatch(/Checking/);
    expect(html).toMatch(/Insurance/);
    expect(html).toContain('href="/finance/upcoming-expenses/expense-1"');
    expect(html).toContain('href="/finance/upcoming-expenses/expense-2"');

    const note = renderToStaticMarkup(<PostItNote
      task={task}
      complete={() => undefined}
      visibleFields={new Set(['upcomingExpenses'])}
      financialLinks={links}
    />);
    expect(note).toMatch(/Rent/);
    expect(note).toMatch(/Insurance/);
    expect(note).toContain('href="/finance/upcoming-expenses/expense-1"');
    expect(note).toContain('href="/finance/upcoming-expenses/expense-2"');
  });

  it('supports type/search and multiple target selection without creating on cancel', () => {
    const changed = vi.fn();
    const view = render(<FinanceItemPicker
      value={[]}
      onChange={changed}
      options={[
        { targetType: 'transaction', targetId: 'tx-1', label: 'Transaction', context: 'Card' },
        { targetType: 'upcomingExpense', targetId: 'expense-1', label: 'Upcoming rent' },
      ]}
    />);
    fireEvent.change(view.getByRole('searchbox'), { target: { value: 'rent' } });
    expect(view.queryByText('Transaction')).toBeNull();
    fireEvent.click(view.getByLabelText('Upcoming rent'));
    expect(changed).toHaveBeenCalledWith([
      { targetType: 'upcomingExpense', targetId: 'expense-1' },
    ]);
  });
});
