import { describe, expect, it } from 'vitest';
import { createList, createListItem, moveListItem, transitionListItem } from '../src/list.js';

describe('lists and lightweight items', () => {
  it('creates independently versioned items without task fields', () => {
    const list = createList({ name: ' Groceries ' }, 'owner', new Date('2026-01-01T00:00:00Z'));
    const item = createListItem(
      list.id,
      { name: 'Milk' },
      'owner',
      undefined,
      new Date('2026-01-01T00:00:01Z'),
    );
    expect(list.name).toBe('Groceries');
    expect(item.listId).toBe(list.id);
    expect(item).not.toHaveProperty('label');
  });
  it('completes, reopens, removes, and reorders items with valid metadata', () => {
    const item = createListItem('01J00000000000000000000000', { name: 'Milk' }, 'owner');
    const completed = transitionListItem(item, 'completed', 'owner');
    expect(completed.completedBy).toBe('owner');
    expect(transitionListItem(completed, 'open', 'owner').completedAt).toBeUndefined();
    expect(transitionListItem(item, 'removed', 'owner').status).toBe('removed');
    expect(moveListItem(item, '000000000020').orderKey).toBe('000000000020');
  });
});
