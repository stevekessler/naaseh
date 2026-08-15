import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UrgencyBadge } from '../../src/components/UrgencyBadge.js';
import { UrgencyField } from '../../src/components/UrgencyField.js';

describe('urgency controls', () => {
  it('renders a native keyboard-selectable field with every full text label', () => {
    const html = renderToStaticMarkup(
      <UrgencyField value="medium" onChange={vi.fn()} label="Urgency" />,
    );

    expect(html).toContain('<select');
    expect(html).toContain('aria-label="Urgency"');
    expect(html).toContain('value="low"');
    expect(html).toContain('>Low<');
    expect(html).toContain('>Low<');
    expect(html).toContain('>Medium<');
    expect(html).toContain('>High<');
    expect(html).toContain('>Critical<');
    expect(html).toContain('value="medium" selected=""');
  });

  it('gives each badge a screen-reader name and a non-color-only semantic cue', () => {
    const html = renderToStaticMarkup(<UrgencyBadge urgency="critical" />);

    expect(html).toContain('aria-label="Priority: Critical"');
    expect(html).toContain('data-urgency="critical"');
    expect(html).toContain('Critical');
  });
});
