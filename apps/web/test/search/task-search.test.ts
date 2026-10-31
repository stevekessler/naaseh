import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import {
  filterTasks,
  filterTasksForViewer,
  filtersExpandToAllReadable,
  normalizeSearch,
  searchTaskIds,
} from '../../src/search/task-search.js';
import { filtersFromSearch, safeSearchState } from '../../src/features/search/search-state.js';
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
      parentId: '01J00000000000000000000003',
      percentComplete: 60,
      dueKind: 'date',
      dueDate: '2026-10-06',
    });
    const other = task('Other', { label: 'Other', urgency: 'low' });
    const parentFilters = {
      query: '',
      from: '',
      to: '',
      assigneeId: '',
      categoryId: '',
      urgencies: [],
      parentId: match.parentId,
    };
    expect(filterTasks([match, other], parentFilters)).toEqual([match]);
    expect(filtersFromSearch(safeSearchState('', parentFilters)).parentId).toBe(match.parentId);
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
        parentId: '01J00000000000000000000003',
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
  it('defaults to the viewer and their groups but expands for another assignee', () => {
    const mine = task('Mine', { label: 'Mine', assigneeId: 'viewer' });
    const group = task('Group', {
      label: 'Group',
      assigneeId: 'teammate',
      groupId: 'family',
    });
    const publicOther = task('Other', { label: 'Other', assigneeId: 'alex' });
    const filters = {
      query: '',
      assigneeId: '',
      assigneeIds: [],
      groupIds: [],
      categoryId: '',
      from: '',
      to: '',
      urgencies: [],
      match: 'all' as const,
      scope: 'default' as const,
    };
    const viewer = { userId: 'viewer', groupIds: ['family'] };
    expect(filterTasksForViewer([mine, group, publicOther], filters, viewer)).toEqual([
      mine,
      group,
    ]);
    const crossUser = { ...filters, assigneeIds: ['alex'] };
    expect(filtersExpandToAllReadable(crossUser, viewer)).toBe(true);
    expect(filterTasksForViewer([mine, group, publicOther], crossUser, viewer)).toEqual([
      publicOther,
    ]);
  });
  it('supports Match any across assignee and urgency conditions', () => {
    const steve = task('Steve normal', {
      label: 'Steve normal',
      assigneeId: 'steve',
      urgency: 'medium',
    });
    const critical = task('Alex critical', {
      label: 'Alex critical',
      assigneeId: 'alex',
      urgency: 'critical',
    });
    const neither = task('Alex low', {
      label: 'Alex low',
      assigneeId: 'alex',
      urgency: 'low',
    });
    expect(
      filterTasks([steve, critical, neither], {
        query: '',
        assigneeId: '',
        assigneeIds: ['steve'],
        groupIds: [],
        categoryId: '',
        from: '',
        to: '',
        urgencies: ['critical'],
        match: 'any',
      }),
    ).toEqual([steve, critical]);
  });
  it('round-trips multi-value Boolean filter state without query text', () => {
    expect(
      safeSearchState('private phrase', {
        query: 'private phrase',
        from: '',
        to: '',
        assigneeId: '',
        assigneeIds: ['steve', 'heather'],
        groupIds: ['family'],
        match: 'any',
        scope: 'all',
        categoryId: '',
        urgencies: [],
      }),
    ).toBe('assigneeIds=steve%2Cheather&groupIds=family&match=any&scope=all');
  });
});
