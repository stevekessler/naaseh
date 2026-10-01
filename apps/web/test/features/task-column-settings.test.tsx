// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaskColumnSettings, useTaskColumns } from '../../src/features/tasks/TaskColumnSettings.js';

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
});
