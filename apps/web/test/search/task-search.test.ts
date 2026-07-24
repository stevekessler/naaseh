import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import { filterTasks, normalizeSearch, searchTaskIds } from '../../src/search/task-search.js';
import { safeSearchState } from '../../src/features/search/search-state.js';
describe('authorized task search', () => {
  const task = (label: string, extra: Parameters<typeof createTask>[0] = { label }) =>
    createTask({ label, ...extra }, 'u');
  it('normalizes Unicode/case and ranks prefix or fuzzy matches', () => {
    const exact = task('Résumé planning');
    const fuzzy = task('Resume planing');
    expect(normalizeSearch('  RÉSUMÉ ')).toBe('résumé');
    const ids = searchTaskIds([exact, fuzzy], 'résumé');
    expect(ids.has(exact.id)).toBe(true);
  });
  it('composes date, assignee, and category filters', () => {
    const match = task('Call dentist', {
      label: 'Call dentist',
      dueAt: '2026-02-01T00:00:00.000Z',
      dueTimeZone: 'UTC',
      assigneeId: 'steve',
      categoryId: 'calls',
    });
    const other = task('Other');
    expect(
      filterTasks([match, other], {
        query: 'dent',
        from: '2026-01-01',
        to: '2026-12-31',
        assigneeId: 'steve',
        categoryId: 'calls',
      }),
    ).toEqual([match]);
  });
  it('searches a hidden task label without indexing its memo and drops stale IDs on rebuild', () => {
    const hidden = task('Visible label', {
      label: 'Visible label',
      memoHidden: true,
      encryptedMemo: 'ciphertext',
    });
    expect(searchTaskIds([hidden], 'visible').has(hidden.id)).toBe(true);
    expect(searchTaskIds([hidden], 'classified').has(hidden.id)).toBe(false);
    expect(searchTaskIds([], 'visible').has(hidden.id)).toBe(false);
  });
  it('never serializes query or memo terms into navigation state', () =>
    expect(
      safeSearchState('classified memo', {
        query: 'classified memo',
        from: '',
        to: '',
        assigneeId: 'steve',
        categoryId: '',
      }),
    ).toBe('assigneeId=steve'));
});
