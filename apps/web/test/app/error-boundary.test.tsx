// @vitest-environment jsdom

import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '../../src/app/ErrorBoundary.js';

afterEach(cleanup);

function BrokenView(): never {
  throw new Error('synthetic render failure');
}

describe('application error boundary', () => {
  it('renders a recovery screen instead of a blank page', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const view = render(
      <ErrorBoundary>
        <BrokenView />
      </ErrorBoundary>,
    );

    expect(view.getByRole('heading', { name: "Na'aseh hit a problem" })).toBeTruthy();
    expect(view.getByRole('button', { name: "Reload Na'aseh" })).toBeTruthy();
    consoleError.mockRestore();
  });

  it('requires explicit confirmation before resetting local data', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onResetLocalData = vi.fn(async () => undefined);
    const view = render(
      <ErrorBoundary onResetLocalData={onResetLocalData}>
        <BrokenView />
      </ErrorBoundary>,
    );

    fireEvent.click(view.getByRole('button', { name: 'Show recovery options' }));
    expect(onResetLocalData).not.toHaveBeenCalled();
    expect(view.getByText(/permanently removes unsynced changes/i)).toBeTruthy();
    fireEvent.click(view.getByRole('button', { name: 'Confirm reset and sign out' }));
    await waitFor(() => expect(onResetLocalData).toHaveBeenCalledOnce());
    consoleError.mockRestore();
  });
});
