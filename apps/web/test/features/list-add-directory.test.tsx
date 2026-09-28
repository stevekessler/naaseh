import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ListItemCreateForm, parseInitialListItem } from '../../src/features/lists/ListItems.js';

describe('list item create form', () => {
  it('normalizes the name without adding a monetary value', () => {
    expect(parseInitialListItem(' Rebate ')).toEqual({ name: 'Rebate' });
  });

  it('renders name and optional details without money controls', () => {
    const html = renderToStaticMarkup(<ListItemCreateForm add={vi.fn()} />);
    expect(html).toContain('Add an item');
    expect(html).not.toContain('Amount');
    expect(html).not.toContain('Credit');
    expect(html).not.toContain('global directory');
    expect(html).not.toContain('Archive');
  });
});
