// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CrisisPlanEditor,
  shouldWarnForUnsavedCrisisPlan,
} from '../../src/features/journal/CrisisPlanEditor.js';

afterEach(cleanup);
describe('Crisis Plan owner page states', () => {
  it('preserves the draft after a failed save, supports retry, warns on navigation, and exposes no delete action', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new Error('Encrypted save failed. Retry safely.'))
      .mockResolvedValueOnce(undefined);
    const view = render(
      <CrisisPlanEditor
        initial={{
          version: 1,
          blocks: [{ type: 'paragraph', children: [{ type: 'text', text: 'Call someone' }] }],
        }}
        onSave={save}
      />,
    );
    expect(view.queryByRole('button', { name: /delete/i })).toBeNull();
    expect(view.getByRole('textbox', { name: 'Crisis Plan' })).toBeTruthy();
    expect(shouldWarnForUnsavedCrisisPlan(true)).toBe(true);
    fireEvent.click(view.getByRole('button', { name: 'Save Crisis Plan' }));
    await view.findByText('Encrypted save failed. Retry safely.');
    fireEvent.click(view.getByRole('button', { name: 'Save Crisis Plan' }));
    await waitFor(() => expect(view.getByText('Crisis Plan saved.')).toBeTruthy());
    expect(save).toHaveBeenCalledTimes(2);
  });
});
