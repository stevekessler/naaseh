import { describe, expect, it } from 'vitest';
import type { List, ListItem } from '@naaseh/domain';
import {
  sortListItemsForTable,
  sortListsForTable,
} from '../../src/features/lists/list-table-sort.js';

const list = (id: string, name: string, urgency = 'normal') => ({ id, name, urgency }) as List;
const item = (
  id: string,
  name: string,
  status: ListItem['status'] = 'open',
  extra: Partial<ListItem> = {},
) => ({ item: { id, status, ...extra } as ListItem, name });

describe('list table sorting', () => {
  it('keeps completed items last by default and while sorting data columns', () => {
    const values = [
      item('completed', 'Alpha', 'completed', { completedAt: '2026-01-01T00:00:00.000Z' }),
      item('open-z', 'Zulu'),
      item('open-b', 'Beta'),
    ];

    expect(sortListItemsForTable(values).map(({ item }) => item.id)).toEqual([
      'open-z',
      'open-b',
      'completed',
    ]);
    expect(
      sortListItemsForTable(values, { key: 'name', direction: 'ascending' }).map(
        ({ item }) => item.id,
      ),
    ).toEqual(['open-b', 'open-z', 'completed']);
  });

  it('sorts list overview columns in both directions using open-item counts', () => {
    const values = [list('a', 'Alpha'), list('b', 'Beta')];
    const counts = new Map([
      ['a', 1],
      ['b', 3],
    ]);

    expect(
      sortListsForTable(
        values,
        { key: 'items', direction: 'descending' },
        counts,
        new Map(),
        new Map(),
      ).map((value) => value.id),
    ).toEqual(['b', 'a']);
  });
});
