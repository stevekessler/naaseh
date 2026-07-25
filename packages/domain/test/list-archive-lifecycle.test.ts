import { describe, expect, it } from 'vitest';
import { archiveList, createList, createListItem, finishList, restoreList } from '../src/index.js';

const now = new Date('2026-07-24T12:00:00.000Z');

describe('list archive lifecycle', () => {
  it('finishes and restores only the parent while retaining every child state', () => {
    const list = createList({ name: 'Launch' }, 'owner', now);
    const children = Array.from({ length: 1_000 }, (_, index) =>
      createListItem(list.id, { name: `Item ${index}` }, 'owner', undefined, now),
    );
    const finished = finishList(list, 'owner', now);
    const restored = restoreList(finished, 'owner', new Date('2026-07-25T12:00:00.000Z'));
    expect(finished).toMatchObject({ lifecycle: 'archived', archiveReason: 'finished' });
    expect(restored.lifecycle).toBe('active');
    expect(children).toHaveLength(1_000);
    expect(children.every((item) => item.status === 'open')).toBe(true);
  });

  it('supports manual archive without mutating children', () => {
    const list = createList({ name: 'Reference' }, 'owner', now);
    expect(archiveList(list, 'owner', now).archiveReason).toBe('manual');
  });
});
