import { describe, expect, it } from 'vitest';
import { MixedContentIndex } from '../../apps/web/src/search/task-index.js';
describe('mixed search privacy', () => {
  it('removes revoked documents, counts, and snippets without leaking through filters', () => {
    const index = new MixedContentIndex();
    index.upsert({ id: 'public', type: 'todo', title: 'Visible' });
    index.upsert({ id: 'private-list', type: 'list', title: 'Secret cedar' });
    index.upsert({
      id: 'private-item',
      type: 'listItem',
      parentId: 'private-list',
      title: 'Hidden milk',
    });
    expect(index.search('secret', 'all')).toEqual(['private-list']);
    index.remove('private-item');
    index.remove('private-list');
    expect(index.search('secret', 'all')).toEqual([]);
    expect(index.search('hidden', 'lists')).toEqual([]);
    expect(index.search('visible', 'todos')).toEqual(['public']);
  });
});
