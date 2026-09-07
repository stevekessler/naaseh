// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react';
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
});
