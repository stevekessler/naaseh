import { describe, expect, it } from 'vitest';
import { filterListsByTitle } from '../../src/features/lists/ListIndexPage.js';
import { filterListItems } from '../../src/features/lists/ListItems.js';

describe('list filtering', () => {
  it('filters list titles case-insensitively after Unicode normalization', () => {
    const lists = [{ name: 'Weekly Groceries' }, { name: 'Hardware' }] as never;
    expect(filterListsByTitle(lists, '  GROCERIES ')).toEqual([lists[0]]);
  });

  it('searches effective item names, memos, and links', () => {
    const milk = {
      name: 'Milk',
      item: { memo: 'Keep cold', fileLinks: ['https://example.com/dairy'] },
    } as never;
    const eggs = { name: 'Eggs', item: {} } as never;
    expect(filterListItems([milk, eggs], 'cold')).toEqual([milk]);
    expect(filterListItems([milk, eggs], 'DAIRY')).toEqual([milk]);
    expect(filterListItems([milk, eggs], 'egg')).toEqual([eggs]);
  });
});
