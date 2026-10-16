// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ListColumnSettings, useListColumns } from '../../src/features/lists/ListColumnSettings.js';

function Harness() {
  return <ListColumnSettings {...useListColumns()} />;
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

describe('list column settings', () => {
  it('uses readable phone defaults and keeps choices independent per viewport', () => {
    const view = render(<Harness />);
    fireEvent.click(view.getByText('Columns'));

    expect((view.getByLabelText('Show Due date column') as HTMLInputElement).checked).toBe(true);
    expect((view.getByLabelText('Show Memo column') as HTMLInputElement).checked).toBe(false);
    expect((view.getByLabelText('Show Link column') as HTMLInputElement).checked).toBe(false);
    fireEvent.click(view.getByLabelText('Show Memo column'));

    setWidth(1600);
    expect((view.getByLabelText('Show Memo column') as HTMLInputElement).checked).toBe(true);
    fireEvent.click(view.getByLabelText('Show Actions column'));
    expect((view.getByLabelText('Show Actions column') as HTMLInputElement).checked).toBe(false);

    setWidth(500);
    expect((view.getByLabelText('Show Memo column') as HTMLInputElement).checked).toBe(true);
    expect((view.getByLabelText('Show Actions column') as HTMLInputElement).checked).toBe(true);
  });

  it('closes when the user clicks outside the panel', () => {
    const view = render(<Harness />);
    const settings = view.container.querySelector('details')!;
    fireEvent.click(view.getByText('Columns'));
    expect(settings.open).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(settings.open).toBe(false);
  });
});
