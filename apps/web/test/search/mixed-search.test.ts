import { describe, expect, it } from 'vitest';
import { MixedContentIndex, groupMixedHits } from '../../src/search/task-index.js';
import { filtersFromSearch } from '../../src/features/search/search-state.js';
describe('mixed authorized search', () => {
  it('defaults to all and filters lists or todos', () => {
    expect(filtersFromSearch('')).toMatchObject({ contentType: 'all' });
    const index = new MixedContentIndex();
    index.upsert({ id: 't', type: 'todo', title: 'Milk task', body: '' });
    index.upsert({ id: 'i', type: 'listItem', parentId: 'l', title: 'Milk', body: 'Groceries' });
    expect(index.search('milk', 'lists')).toEqual(['i']);
    expect(index.search('milk', 'todos')).toEqual(['t']);
  });
  it('groups child hits under a list parent', () =>
    expect(groupMixedHits([{ id: 'i', type: 'listItem', parentId: 'l', title: 'Milk' }])).toEqual([
      { parentId: 'l', hits: [expect.objectContaining({ id: 'i' })] },
    ]));
});
