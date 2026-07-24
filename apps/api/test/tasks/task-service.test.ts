import { describe, expect, it } from 'vitest';
import { createTask } from '@naaseh/domain';
import { prepareTaskUpdate } from '../../src/tasks/task-service.js';

describe('task mutation service', () => {
  it('rejects ancestry cycles and unsafe links', () => {
    const parent = createTask({ label: 'parent' }, 'u');
    const child = createTask({ label: 'child', parentId: parent.id }, 'u');
    const tasks = new Map([
      [parent.id, parent],
      [child.id, child],
    ]);
    expect(() => prepareTaskUpdate(parent, { parentId: child.id }, 'u', tasks)).toThrow('ancestor');
    expect(() => prepareTaskUpdate(parent, { link: 'http://example.com' }, 'u', tasks)).toThrow(
      'HTTPS',
    );
  });
  it('does not create a new logical mutation for an unchanged replay', () => {
    const task = createTask({ label: 'same' }, 'u');
    const prepared = prepareTaskUpdate(task, { label: 'same' }, 'u', new Map([[task.id, task]]));
    expect(prepared).toMatchObject({ task, noChange: true, changedFields: [] });
  });
  it('applies category defaults without overriding an explicit assignee', () => {
    const task = createTask({ label: 'task' }, 'u');
    const category = {
      id: 'c',
      name: 'Calls',
      color: '#36a83f',
      defaultAssigneeId: 'default',
      archived: false,
      version: 1,
    };
    expect(
      prepareTaskUpdate(task, { categoryId: 'c' }, 'u', new Map(), category).task.assigneeId,
    ).toBe('default');
    expect(
      prepareTaskUpdate(task, { categoryId: 'c', assigneeId: 'chosen' }, 'u', new Map(), category)
        .task.assigneeId,
    ).toBe('chosen');
  });
  it('uses semantic completion and reopen transitions', () => {
    const task = createTask({ label: 'task' }, 'u');
    const completed = prepareTaskUpdate(
      task,
      { status: 'completed' },
      'u',
      new Map(),
      undefined,
      new Date('2026-01-01T00:00:00Z'),
    );
    expect(completed.task).toMatchObject({ status: 'completed', completedBy: 'u', version: 2 });
    expect(completed.operation).toBe('complete');
    expect(
      prepareTaskUpdate(completed.task, { status: 'open' }, 'u', new Map()).task.completedAt,
    ).toBeUndefined();
  });
});
