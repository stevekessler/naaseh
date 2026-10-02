// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  PostItFieldSettings,
  usePostItFields,
} from '../../src/features/postit/PostItFieldSettings.js';

function Harness() {
  const fields = usePostItFields();
  return <PostItFieldSettings {...fields} />;
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1600 });
});
afterEach(cleanup);

describe('post-it field settings', () => {
  it('persists field choices and closes when the user clicks away', () => {
    const view = render(<Harness />);
    const settings = view.container.querySelector('details')!;
    fireEvent.click(view.getByText('Fields'));
    fireEvent.click(view.getByLabelText('Show Memo on post-its'));

    expect((view.getByLabelText('Show Memo on post-its') as HTMLInputElement).checked).toBe(false);
    expect(localStorage.getItem('naaseh.post-it-fields.v1.desktop')).not.toContain('memo');

    fireEvent.pointerDown(document.body);
    expect(settings.open).toBe(false);
  });
});
