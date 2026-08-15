import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import {
  AssigneePicker,
  canonicalAssigneeId,
  mergeAssigneeOptions,
} from '../../src/components/AssigneePicker.js';
import {
  categoryDefaultAssignee,
  eligibleParentTasks,
  TaskForm,
} from '../../src/features/tasks/TaskForm.js';
import { TaskFilters } from '../../src/features/search/TaskFilters.js';
import { PersonalStackPage } from '../../src/features/stacks/PersonalStackPage.js';

const category = {
  id: 'category-home',
  name: 'Home',
  color: '#36a83f',
  archived: false,
  lifecycle: 'active' as const,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  version: 1,
};
const project = {
  id: 'project-yard',
  categoryId: category.id,
  name: 'Yard',
  lifecycle: 'active' as const,
  createdAt: '2026-08-10T00:00:00.000Z',
  updatedAt: '2026-08-10T00:00:00.000Z',
  version: 1,
};
const assignees = [
  { id: 'user-steve', displayName: 'Steve', username: 'steve' },
  { id: 'user-smoke', displayName: 'Smoke test', username: 'naaseh-smoke' },
];
const filters = {
  query: '',
  from: '',
  to: '',
  assigneeId: '',
  categoryId: '',
  projectId: '',
  lifecycle: 'active' as const,
  contentType: 'all' as const,
  urgencies: [],
};

describe('shared assignment controls', () => {
  it('renders assignees as a native dropdown and excludes @naaseh-smoke', () => {
    const html = renderToStaticMarkup(<AssigneePicker assignees={assignees} />);

    expect(html).toContain('<select');
    expect(html).toContain('Steve (@steve)');
    expect(html).not.toContain('naaseh-smoke');
  });

  it('merges legacy assignee IDs with the canonical username identity', () => {
    const canonical = {
      id: 'user-steve',
      displayName: 'Steve Kessler',
      username: 'steve',
    };
    const options = mergeAssigneeOptions(
      [{ id: 'Steve', displayName: 'Steve' }, canonical],
      ['Steve', '@steve'],
    );
    const html = renderToStaticMarkup(<AssigneePicker assignees={options} defaultValue="Steve" />);

    expect(options).toEqual([canonical]);
    expect(canonicalAssigneeId(options, 'Steve')).toBe('user-steve');
    expect(html).toContain(
      '<option value="user-steve" selected="">Steve Kessler (@steve)</option>',
    );
    expect(html).not.toContain('<option value="Steve">Steve</option>');
  });

  it('uses Category, Project, and Assignee dropdowns in task creation and filters', () => {
    const form = renderToStaticMarkup(
      <TaskForm
        save={vi.fn()}
        categories={[category]}
        projects={[project]}
        assignees={assignees}
      />,
    );
    const filterMarkup = renderToStaticMarkup(
      <TaskFilters
        value={filters}
        change={vi.fn()}
        categories={[category]}
        projects={[project]}
        assignees={assignees}
      />,
    );

    for (const markup of [form, filterMarkup]) {
      expect(markup).toContain('name="categoryId"');
      expect(markup).toContain('name="projectId"');
      expect(markup).toContain('name="assigneeId"');
      expect(markup).toContain('Home');
      expect(markup).toContain('Yard');
    }
  });

  it('defaults new tasks to the logged-in assignee and offers only open parent tasks', () => {
    const now = new Date('2026-08-10T00:00:00.000Z');
    const openParent = createTask({ label: 'Open parent' }, 'user-steve', now);
    const completedParent = {
      ...createTask({ label: 'Completed parent' }, 'user-steve', now),
      status: 'completed' as const,
      completionState: 'completed' as const,
      completedAt: now.toISOString(),
      completedBy: 'user-steve',
    };
    const html = renderToStaticMarkup(
      <TaskForm
        save={vi.fn()}
        assignees={assignees}
        defaultAssigneeId="user-steve"
        parentTasks={[openParent, completedParent]}
      />,
    );

    expect(html).toContain('<option value="user-steve" selected="">Steve (@steve)</option>');
    expect(html).toContain('name="parentId"');
    expect(eligibleParentTasks(undefined, [openParent, completedParent])).toEqual([openParent]);
    expect(html).toContain('>Link<');
    expect(html).not.toContain('HTTPS link');
    expect(html).toContain('<details class="task-form-details">');
    expect(html.indexOf('>Task label<')).toBeLessThan(html.indexOf('>Task details<'));
    expect(html.indexOf('>Memo<')).toBeLessThan(html.indexOf('>Link<'));
  });

  it('prefers a category default over the creator without changing an existing task', () => {
    const categorized = { ...category, defaultAssigneeId: 'user-category' };
    expect(categoryDefaultAssignee(category.id, [categorized], 'user-steve')).toBe('user-category');

    const existing = createTask(
      { label: 'Unassigned task', categoryId: category.id },
      'user-steve',
      new Date('2026-08-10T00:00:00.000Z'),
    );
    const html = renderToStaticMarkup(
      <TaskForm
        save={vi.fn()}
        task={existing}
        categories={[categorized]}
        assignees={assignees}
        defaultAssigneeId="user-steve"
      />,
    );
    expect(html).toContain('<option value="" selected="">Unassigned</option>');
    expect(html).toContain('<details class="task-form-details" open="">');
  });

  it('offers task creation on Personal Stack with the same dropdowns', () => {
    const html = renderToStaticMarkup(
      <PersonalStackPage
        scope={{ scopeType: 'overall' }}
        projects={[{ id: project.id, name: project.name }]}
        projectRecords={[project]}
        categories={[category]}
        assignees={assignees}
        items={[]}
        announcement=""
        pendingOperationIds={[]}
        conflictCount={0}
        changeScope={vi.fn()}
        move={vi.fn()}
        createTask={vi.fn()}
      />,
    );

    expect(html).toContain('<summary>New task</summary>');
    expect(html).toContain('Add to stack');
    expect(html).toContain('name="categoryId"');
    expect(html).not.toContain('naaseh-smoke');
  });
});
