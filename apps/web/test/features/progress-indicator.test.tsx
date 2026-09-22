// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ProgressIndicator } from '../../src/components/ProgressIndicator.js';

afterEach(cleanup);

describe('task progress indicator', () => {
  it('reveals the exact percentage on touch taps but not desktop clicks', () => {
    const view = render(<ProgressIndicator percent={45} label="Draft proposal" />);
    const button = view.getByRole('button', { name: 'Draft proposal progress: 45% complete' });
    const tooltip = view.getByRole('tooltip');

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(tooltip.textContent).toBe('45% complete');
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    const touch = () => {
      const event = new Event('pointerup', { bubbles: true });
      Object.defineProperty(event, 'pointerType', { value: 'touch' });
      fireEvent(button, event);
    };
    touch();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    touch();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
