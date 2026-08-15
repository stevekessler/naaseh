import { describe, expect, it } from 'vitest';
import { memoDocumentText } from '@naaseh/domain';
import { UnlockedHiddenMemoIndex } from '../../src/search/hidden-memo-index.js';

describe('hidden rich memo projection', () => {
  it('indexes only the derived plain projection', () => {
    expect(
      memoDocumentText({
        version: 1,
        blocks: [{ type: 'unorderedList', items: [{ runs: [{ text: 'Safe', marks: [] }] }] }],
      }),
    ).toBe('• Safe');
  });

  it('keeps unlocked projection search in memory and purges it on lock', () => {
    const index = new UnlockedHiddenMemoIndex();
    index.unlock('task-private', {
      version: 1,
      blocks: [{ type: 'paragraph', runs: [{ text: 'private phrase', marks: ['bold'] }] }],
    });
    expect(index.search('phrase')).toEqual(['task-private']);
    index.lock();
    expect(index.search('phrase')).toEqual([]);
  });
});
