// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProgressIndicator } from '../../src/components/ProgressIndicator.js';

afterEach(cleanup);

describe('task progress indicator', () => {
  it('opens on desktop clicks and saves an adjusted percentage', () => {
    const change = vi.fn();
    const view = render(
      <ProgressIndicator percent={45} label="Draft proposal" onChange={change} />,
    );
    const button = view.getByRole('button', { name: 'Draft proposal progress: 45% complete' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(view.getByLabelText('Draft proposal percent complete'), {
      target: { value: '70' },
    });
    fireEvent.click(view.getByRole('button', { name: 'Save' }));
    expect(change).toHaveBeenCalledWith(70);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
