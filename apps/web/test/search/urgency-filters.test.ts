import { createTask, type Task, type Urgency } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import { filtersFromSearch, safeSearchState } from '../../src/features/search/search-state.js';
import { filterTasks, type Filters } from '../../src/search/task-search.js';

type UrgencyFilters = Filters & { urgencies: Urgency[] };

const filters = (overrides: Partial<UrgencyFilters> = {}): UrgencyFilters => ({
  query: '',
  from: '',
  to: '',
  assigneeId: '',
  categoryId: '',
  projectId: '',
  lifecycle: 'active',
  contentType: 'all',
  urgencies: [],
  ...overrides,
});

const task = (label: string, urgency: Urgency) => createTask({ label, urgency }, 'viewer');

describe('urgency filtering', () => {
  it('matches a single urgency and treats an empty set as no urgency restriction', () => {
    const low = task('Low work', 'low');
    const high = task('High work', 'high');

    expect(filterTasks([low, high], filters({ urgencies: ['high'] }))).toEqual([high]);
    expect(filterTasks([low, high], filters({ urgencies: [] }))).toEqual([low, high]);
  });

  it('matches any selected urgency without re-sorting the personal input order', () => {
    const critical = task('Critical third', 'critical');
    const extraLow = task('Extra Low first', 'extra_low');
    const high = task('High second', 'high');

    expect(
      filterTasks([critical, extraLow, high], filters({ urgencies: ['high', 'critical'] })),
    ).toEqual([critical, high]);
  });

  it('round-trips a normalized urgency set through safe URL state', () => {
    const serialized = safeSearchState(
      'private search text',
      filters({ urgencies: ['critical', 'high', 'critical'] }),
    );
    const restored = filtersFromSearch(serialized) as UrgencyFilters;

    expect(new URLSearchParams(serialized).get('urgencies')).toBe('high,critical');
    expect(restored.urgencies).toEqual(['high', 'critical']);
    expect(serialized).not.toContain('private');
  });

  it('rejects invalid URL values instead of partially applying an ambiguous set', () => {
    const restored = filtersFromSearch('?urgencies=high,urgent') as UrgencyFilters;
    expect(restored.urgencies).toEqual([]);
  });

  it('combines urgency with search, date, assignee, Category, Project, lifecycle, and content type', () => {
    const matching = createTask(
      {
        label: 'Release readiness',
        urgency: 'high',
        dueAt: '2026-08-10T12:00:00.000Z',
        dueTimeZone: 'UTC',
        assigneeId: 'viewer',
        categoryId: '01J00000000000000000000008',
        projectId: '01J00000000000000000000009',
      },
      'viewer',
    );
    const variant = (patch: Partial<Task>) => ({
      ...matching,
      id: `${matching.id}-${JSON.stringify(patch)}`,
      ...patch,
    });
    const candidates: Task[] = [
      variant({ urgency: 'critical' }),
      variant({ label: 'Unrelated planning' }),
      variant({ dueAt: '2026-07-31T12:00:00.000Z' }),
      variant({ dueAt: '2026-09-01T12:00:00.000Z' }),
      variant({ assigneeId: 'someone-else' }),
      variant({ categoryId: '01J00000000000000000000018' }),
      variant({ projectId: '01J00000000000000000000019' }),
      variant({ lifecycle: 'archived' }),
      matching,
    ];

    expect(
      filterTasks(
        candidates,
        filters({
          query: 'release',
          from: '2026-08-01',
          to: '2026-08-31',
          assigneeId: 'viewer',
          categoryId: '01J00000000000000000000008',
          projectId: '01J00000000000000000000009',
          lifecycle: 'active',
          contentType: 'todos',
          urgencies: ['high'],
        }),
      ),
    ).toEqual([matching]);
  });
});
