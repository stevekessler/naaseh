// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalUnlock } from '../../src/features/journal/JournalUnlock.js';
import { JournalEnrollmentError } from '../../src/features/journal/journal-enrollment.js';

afterEach(cleanup);

describe('Journal PIN form failures', () => {
  it('does not blame the PIN when first-time enrollment fails before persistence', async () => {
    const onEnroll = vi.fn(async () => {
      throw new Error('WebAssembly blocked');
    });
    const view = render(<JournalUnlock enrolled={false} onEnroll={onEnroll} onUnlock={vi.fn()} />);

    fireEvent.change(view.getByLabelText('Journal PIN'), { target: { value: '246810' } });
    fireEvent.click(view.getByRole('button', { name: 'Create Journal' }));

    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toBe(
        'The Journal could not be created. No enrollment was saved. Refresh and try again.',
      ),
    );
    expect(onEnroll).toHaveBeenCalledWith('246810');
  });

  it('retains the PIN-specific message for an existing Journal unlock failure', async () => {
    const view = render(
      <JournalUnlock
        enrolled
        onEnroll={vi.fn()}
        onUnlock={vi.fn(async () => {
          throw new Error('Incorrect PIN');
        })}
      />,
    );

    fireEvent.change(view.getByLabelText('Journal PIN'), { target: { value: '246810' } });
    fireEvent.click(view.getByRole('button', { name: 'Unlock' }));

    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toBe(
        'The journal could not be unlocked. Check the PIN and try again.',
      ),
    );
  });

  it('shows a non-sensitive enrollment stage without exposing the underlying failure', async () => {
    const view = render(
      <JournalUnlock
        enrolled={false}
        onEnroll={vi.fn(async () => {
          throw new JournalEnrollmentError('registry-verification', new Error('private detail'));
        })}
        onUnlock={vi.fn()}
      />,
    );

    fireEvent.change(view.getByLabelText('Journal PIN'), { target: { value: '246810' } });
    fireEvent.click(view.getByRole('button', { name: 'Create Journal' }));

    await waitFor(() =>
      expect(view.getByRole('alert').textContent).toBe(
        'Journal creation stopped while verifying the recovery-key registry. No enrollment was saved.',
      ),
    );
    expect(view.getByRole('alert').textContent).not.toContain('private detail');
  });
});
