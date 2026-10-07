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
  it('filters date-only and timed work by local calendar date', () => {
    const dateOnly = task('Date only', {
      label: 'Date only',
      dueKind: 'date',
      dueDate: '2026-10-05',
    });
    const timed = task('Timed', {
      label: 'Timed',
      dueAt: '2026-10-06T18:00:00.000Z',
      dueTimeZone: 'UTC',
    });
    const base = {
      query: '',
      assigneeId: '',
      categoryId: '',
      urgencies: [],
      from: '2026-10-05',
      to: '2026-10-05',
    };
    expect(filterTasks([dateOnly, timed], base)).toEqual([dateOnly]);
  });

  it('supports every task filter dimension in combination', () => {
    const match = task('Matching', {
      label: 'Matching',
      assigneeId: 'alex',
      categoryId: '01J00000000000000000000001',
      projectId: '01J00000000000000000000002',
      urgency: 'critical',
      percentComplete: 60,
      dueKind: 'date',
      dueDate: '2026-10-06',
    });
    const other = task('Other', { label: 'Other', urgency: 'low' });
    expect(
      filterTasks([match, other], {
        query: 'match',
        assigneeId: 'alex',
        categoryId: '01J00000000000000000000001',
        projectId: '01J00000000000000000000002',
        from: '2026-10-06',
        to: '2026-10-06',
        lifecycle: 'active',
        contentType: 'todos',
        progress: 'in-progress',
        urgencies: ['critical'],
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
  it('filters tasks by progress without treating a saved percentage as completion history', () => {
    const untouched = task('Untouched');
    const underway = task('Underway', { label: 'Underway', percentComplete: 45 });
    const done = task('Done', { label: 'Done', percentComplete: 100 });
    const base = {
      query: '',
      from: '',
      to: '',
      assigneeId: '',
      categoryId: '',
      urgencies: [],
    };
    expect(filterTasks([untouched, underway, done], { ...base, progress: 'in-progress' })).toEqual([
      underway,
    ]);
    expect(filterTasks([untouched, underway, done], { ...base, progress: 'complete' })).toEqual([
      done,
    ]);
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
