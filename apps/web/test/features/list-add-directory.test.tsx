import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ListItemCreateForm, parseInitialListItem } from '../../src/features/lists/ListItems.js';

describe('list item create form', () => {
  it('uses signed cost and credit semantics without modifying the valid name', () => {
    expect(parseInitialListItem(' Rebate ', '5.25', true)).toEqual({
      name: 'Rebate',
      amountMinor: 525,
    });
    expect(parseInitialListItem('Bread', '4.50', false)).toEqual({
      name: 'Bread',
      amountMinor: -450,
    });
    expect(() => parseInitialListItem('Rebate', '1.234', false)).toThrow(
      'no more than two decimal places',
    );
    expect(parseInitialListItem('Note', '', false)).toEqual({
      name: 'Note',
      amountMinor: null,
    });
  });

  it('renders name, optional amount, credit control, and no global CRUD', () => {
    const html = renderToStaticMarkup(<ListItemCreateForm add={vi.fn()} />);
    expect(html).toContain('Add an item');
    expect(html).toContain('Amount');
    expect(html).toContain('Credit');
    expect(html).not.toContain('global directory');
    expect(html).not.toContain('Archive');
  });
});
