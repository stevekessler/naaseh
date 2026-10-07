import type { CategoryRecord, Project, Task } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import {
  sortTasksForTable,
  type TaskListSortKey,
} from '../../src/features/tasks/task-list-sort.js';

const categories = [
  { id: 'category-b', name: 'Home' },
  { id: 'category-a', name: 'Clients' },
] as CategoryRecord[];
const projects = [
  { id: '01J00000000000000000000001', name: 'Zebra', categoryId: 'category-b' },
  { id: '01J00000000000000000000002', name: 'Alpha', categoryId: 'category-a' },
] as Project[];
const task = (label: string, patch: Partial<Task> = {}) =>
  ({
    id: `01J0000000000000000000000${label.length}`,
    ownerId: 'owner',
    label,
    memo: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    visibility: 'public',
    urgency: 'medium',
    percentComplete: 0,
    status: 'open',
    version: 1,
    ...patch,
  }) as Task;

const tasks = [
  task('No assignment', { urgency: 'medium' }),
  task('Zebra work', {
    projectId: projects[0]!.id,
    urgency: 'critical',
    dueKind: 'date',
    dueDate: '2026-12-02',
  }),
  task('Alpha work', {
    projectId: projects[1]!.id,
    urgency: 'low',
    dueKind: 'date',
    dueDate: '2026-12-01',
  }),
];

describe('task list sorting', () => {
  it.each([
    [
      'due',
      ['Alpha work', 'Zebra work', 'No assignment'],
      ['Zebra work', 'Alpha work', 'No assignment'],
    ],
    [
      'category',
      ['Alpha work', 'Zebra work', 'No assignment'],
      ['Zebra work', 'Alpha work', 'No assignment'],
    ],
    [
      'project',
      ['Alpha work', 'Zebra work', 'No assignment'],
      ['Zebra work', 'Alpha work', 'No assignment'],
    ],
    [
      'priority',
      ['Alpha work', 'No assignment', 'Zebra work'],
      ['Zebra work', 'No assignment', 'Alpha work'],
    ],
  ] satisfies Array<[TaskListSortKey, string[], string[]]>)(
    '%s sorts both directions and keeps blanks last',
    (key, ascending, descending) => {
      expect(
        sortTasksForTable(tasks, { key, direction: 'ascending' }, categories, projects).map(
          ({ label }) => label,
        ),
      ).toEqual(ascending);
      expect(
        sortTasksForTable(tasks, { key, direction: 'descending' }, categories, projects).map(
          ({ label }) => label,
        ),
      ).toEqual(descending);
    },
  );
});
