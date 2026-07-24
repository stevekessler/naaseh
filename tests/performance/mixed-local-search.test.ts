import { describe, expect, it } from 'vitest';
import { MixedContentIndex } from '../../apps/web/src/search/task-index.js';

describe('mixed local search performance', () => {
  it('indexes and filters 50,000 mixed records within a bounded local budget', () => {
    const index = new MixedContentIndex();
    const started = performance.now();
    for (let value = 0; value < 50_000; value += 1)
      index.upsert({
        id: `document-${value}`,
        type: value % 3 === 0 ? 'todo' : value % 3 === 1 ? 'list' : 'listItem',
        ...(value % 3 === 2 ? { parentId: `document-${value - 1}` } : {}),
        title: value === 49_999 ? 'Distinctive saffron item' : `Item ${value}`,
      });
    const result = index.search('saffron', 'all');
    expect(result).toEqual(['document-49999']);
    expect(performance.now() - started).toBeLessThan(5_000);
  }, 10_000);
});
