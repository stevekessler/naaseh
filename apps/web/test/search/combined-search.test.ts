import { describe, expect, it } from 'vitest';
import { createList, createListItem, createTask } from '@naaseh/domain';
import { buildCombinedSearchRows } from '../../src/features/search/combined-search.js';

describe('combined task and list-item search', () => {
  it('finds active tasks and effective list-item names in one result set', () => {
    const now = new Date('2026-10-16T12:00:00.000Z');
    const task = createTask(
      { label: 'Buy apples', memo: 'Honeycrisp', urgency: 'high' },
      'owner',
      now,
    );
    const list = createList({ name: 'Shopping', urgency: 'medium' }, 'owner', now);
    const item = createListItem(
      list.id,
      { name: 'Apples', memo: 'For pie' },
      'owner',
      undefined,
      now,
    );

    const rows = buildCombinedSearchRows({
      query: 'apple',
      tasks: [task],
      lists: [list],
      items: new Map([[list.id, [item]]]),
      directory: [],
      categories: [],
      projects: [],
    });

    expect(rows.map(({ kind, title }) => ({ kind, title }))).toEqual([
      { kind: 'listItem', title: 'Apples' },
      { kind: 'task', title: 'Buy apples' },
    ]);
  });

  it('searches list context and omits removed items and archived work', () => {
    const now = new Date('2026-10-16T12:00:00.000Z');
    const list = createList({ name: 'Hardware store', urgency: 'low' }, 'owner', now);
    const item = createListItem(list.id, { name: 'Nails' }, 'owner', undefined, now);
    const removed = { ...item, id: '01K00000000000000000000001', status: 'removed' as const };

    const rows = buildCombinedSearchRows({
      query: 'hardware',
      tasks: [],
      lists: [list],
      items: new Map([[list.id, [item, removed]]]),
      directory: [],
      categories: [],
      projects: [],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'listItem', title: 'Nails', listName: 'Hardware store' });
  });
});
