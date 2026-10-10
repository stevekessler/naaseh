import {
  completeAndArchiveTask,
  createTask,
  type CategoryRecord,
  type Project,
} from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  buildTaskReport,
  taskReportCsv,
  taskTimeliness,
} from '../../src/features/reports/task-reporting.js';
import type { CompletionFilterValue } from '../../src/features/reports/CompletionFilters.js';

const categoryId = '01J00000000000000000000001';
const projectId = '01J00000000000000000000002';
const category = {
  id: categoryId,
  name: 'Client work',
  color: '#336699',
  archived: false,
  lifecycle: 'active',
  version: 1,
} satisfies CategoryRecord;
const project = {
  id: projectId,
  categoryId,
  name: 'Launch',
  lifecycle: 'active',
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
  version: 1,
} satisfies Project;

const filters: CompletionFilterValue = {
  period: 'day',
  categoryId: '',
  projectId: '',
  timeZone: 'UTC',
  weekStartsOn: 0,
  urgencies: [],
  from: '2026-10-01',
  to: '2026-10-31',
  taskState: 'all',
  timeliness: 'all',
};

const open = createTask(
  { label: 'Still open', urgency: 'high', projectId, dueKind: 'date', dueDate: '2026-10-20' },
  'owner',
  new Date('2026-10-02T12:00:00.000Z'),
);
const onTime = completeAndArchiveTask(
  createTask(
    {
      label: 'Closed on time',
      urgency: 'critical',
      projectId,
      dueKind: 'timed',
      dueAt: '2026-10-10T17:00:00.000Z',
      dueTimeZone: 'UTC',
    },
    'owner',
    new Date('2026-10-03T12:00:00.000Z'),
  ),
  'owner',
  {},
  new Date('2026-10-10T16:00:00.000Z'),
).task;
const delayed = completeAndArchiveTask(
  createTask(
    { label: 'Closed late', urgency: 'low', dueKind: 'date', dueDate: '2026-10-10' },
    'owner',
    new Date('2026-10-04T12:00:00.000Z'),
  ),
  'owner',
  {},
  new Date('2026-10-11T08:00:00.000Z'),
).task;

describe('task reporting', () => {
  it('reports open, closed, on-time, delayed, priority, and organization totals', () => {
    const report = buildTaskReport([open, onTime, delayed], [category], [project], filters);

    expect(report).toMatchObject({ total: 3, open: 1, closed: 2, onTime: 1, delayed: 1 });
    expect(report.urgencyCounts).toMatchObject({ low: 1, high: 1, critical: 1 });
    expect(report.groups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: 'Client work', project: 'Launch', open: 1, closed: 1 }),
        expect.objectContaining({ category: 'Unassigned', project: 'Unassigned', closed: 1 }),
      ]),
    );
  });

  it('filters closed timing and exports spreadsheet-safe CSV', () => {
    const report = buildTaskReport([open, onTime, delayed], [category], [project], {
      ...filters,
      taskState: 'closed',
      timeliness: 'delayed',
    });

    expect(report.rows.map((row) => row.task.label)).toEqual(['Closed late']);
    expect(taskTimeliness(open, 'UTC')).toBe('not-closed');
    expect(
      taskReportCsv([{ ...report.rows[0]!, task: { ...delayed, label: '=unsafe' } }]),
    ).toContain("'=unsafe");
  });
});
