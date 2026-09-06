import { describe, expect, it } from 'vitest';
import { journalListModel } from '../../src/features/journal/journal-list-model.js';

describe('journal list projection', () => {
  it('sorts newest first and filters inclusive local dates without content search', () => {
    const entries = [
      { id: 'a', date: '2026-03-08' },
      { id: 'b', date: '2026-11-01' },
      { id: 'c', date: '2026-03-09' },
    ] as never;
    expect(
      journalListModel(entries, { start: '2026-03-08', end: '2026-03-09' }).map(
        (entry) => entry.id,
      ),
    ).toEqual(['c', 'a']);
    expect(() => journalListModel(entries, { start: '2026-03-10', end: '2026-03-09' })).toThrow(
      'Start date',
    );
    expect(journalListModel(entries, { start: '2027-01-01' })).toEqual([]);
  });
});
