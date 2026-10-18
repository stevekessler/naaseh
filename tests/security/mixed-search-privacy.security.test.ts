import { describe, expect, it } from 'vitest';
import { MixedContentIndex } from '../../apps/web/src/search/task-index.js';
describe('mixed search privacy', () => {
  it('rejects Journal content at the general-search index boundary', () => {
    const index = new MixedContentIndex();

    expect(() =>
      index.upsert({
        id: 'private-journal-entry',
        type: 'journalEntry',
        title: 'Private reflection',
      } as never),
    ).toThrow('This content type cannot be added to general search.');
    expect(index.search('private')).toEqual([]);
  });

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
