import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createTask, transitionTask } from '@naaseh/domain';
import { PostItBoard } from '../../src/features/postit/PostItBoard.js';
import { PostItNote } from '../../src/features/postit/PostItNote.js';
import { ViewSwitcher } from '../../src/features/tasks/ViewSwitcher.js';
import {
  orderTasksForList,
  rememberTaskView,
  restoreTaskView,
} from '../../src/features/tasks/task-view-state.js';
import { readFileSync } from 'node:fs';

describe('post-it task view', () => {
  it('places overdue time near the title and marks private notes', () => {
    const task = createTask(
      {
        label: 'Follow up',
        dueAt: '2020-01-01T12:30:00.000Z',
        dueTimeZone: 'UTC',
        link: 'https://example.com/a/very/long/task/link/that/is/compact',
      },
      'steve',
    );
    const html = renderToStaticMarkup(
      <PostItNote task={{ ...task, memoHidden: true }} complete={() => undefined} />,
    );
    expect(html.indexOf('postit-due')).toBeLessThan(html.indexOf('postit-meta'));
    expect(html).toContain('overdue-label');
    expect(html).toContain('🔒 Private notes');
    expect(html).toContain('href="https://example.com/a/very/long/task/link/that/is/compact"');
    expect(html).toContain('example.com/a/very/long/task/link');
  });
  it('renders readable category colors and the completion animation state', () => {
    const open = createTask({ label: 'Open task', categoryId: 'calls' }, 'steve');
    const completed = transitionTask(open, 'completed', 'steve');
    const html = renderToStaticMarkup(
      <PostItBoard
        tasks={[completed]}
        categories={[
          {
            id: 'calls',
            name: 'Calls',
            color: '#06366b',
            archived: false,
            version: 1,
          },
        ]}
        currentUserId="steve"
        onToggle={async () => undefined}
      />,
    );
    expect(html).toContain('class="postit crumpled"');
    expect(html).toContain('background:#06366b;color:#ffffff');
    expect(html).toContain('aria-label="Reopen Open task"');
    expect(html).toContain('postit-category');
    expect(html).toContain('Calls');
    expect(html).toContain('Start 10 minute timer for Open task');
    expect(html).toContain('Start 10 min');
  });

  it('shares navigation state while changing views', () => {
    rememberTaskView({ focusedTaskId: 'task-1', scrollY: 420, query: 'cedar' });
    expect(restoreTaskView()).toEqual({
      focusedTaskId: 'task-1',
      scrollY: 420,
      query: 'cedar',
    });
    const html = renderToStaticMarkup(<ViewSwitcher view="postit" change={() => undefined} />);
    expect(html).toContain('aria-pressed="true"');
    const older = createTask({ label: 'Older' }, 'steve', new Date('2026-01-01T00:00:00Z'));
    const ranked = createTask({ label: 'Ranked' }, 'steve', new Date('2026-01-02T00:00:00Z'));
    const newer = createTask({ label: 'Newer' }, 'steve', new Date('2026-01-03T00:00:00Z'));
    expect(
      orderTasksForList(
        [ranked, older, newer],
        new Set([ranked.id]),
        new Map([[ranked.id, 1]]),
      ).map((task) => task.label),
    ).toEqual(['Ranked', 'Newer', 'Older']);
  });

  it('puts due tasks first, followed by stack-ranked and then unstacked tasks', () => {
    const now = new Date(2026, 9, 5, 15, 15);
    const rankedFirst = createTask(
      { label: 'Ranked first' },
      'steve',
      new Date('2026-01-01T00:00:00Z'),
    );
    const rankedDueToday = createTask(
      { label: 'Due today', dueKind: 'date', dueDate: '2026-10-05' },
      'steve',
      new Date('2026-01-02T00:00:00Z'),
    );
    const rankedOverdue = createTask(
      { label: 'Overdue', dueKind: 'date', dueDate: '2026-10-04' },
      'steve',
      new Date('2026-01-03T00:00:00Z'),
    );
    const newFuture = createTask(
      { label: 'New future', dueKind: 'date', dueDate: '2026-10-06' },
      'steve',
      new Date('2026-01-04T00:00:00Z'),
    );
    const stored = new Set([rankedFirst.id, rankedDueToday.id, rankedOverdue.id]);
    const ranks = new Map([
      [rankedFirst.id, 1],
      [rankedDueToday.id, 2],
      [rankedOverdue.id, 3],
    ]);

    expect(
      orderTasksForList(
        [rankedFirst, rankedDueToday, rankedOverdue, newFuture],
        stored,
        ranks,
        now,
      ).map((task) => task.label),
    ).toEqual(['Overdue', 'Due today', 'Ranked first', 'New future']);
  });

  it('orders unstacked work by due date and then newest creation time', () => {
    const olderUndated = createTask(
      { label: 'Older undated' },
      'steve',
      new Date('2026-01-01T00:00:00Z'),
    );
    const newerUndated = createTask(
      { label: 'Newer undated' },
      'steve',
      new Date('2026-01-03T00:00:00Z'),
    );
    const later = createTask(
      { label: 'Later', dueKind: 'date', dueDate: '2026-12-20' },
      'steve',
      new Date('2026-01-04T00:00:00Z'),
    );
    const sooner = createTask(
      { label: 'Sooner', dueKind: 'date', dueDate: '2026-12-10' },
      'steve',
      new Date('2026-01-02T00:00:00Z'),
    );

    expect(
      orderTasksForList(
        [olderUndated, later, newerUndated, sooner],
        new Set(),
        new Map(),
        new Date('2026-10-07T12:00:00Z'),
      ).map((task) => task.label),
    ).toEqual(['Sooner', 'Later', 'Newer undated', 'Older undated']);
  });

  it('offers the shared task editor from a post-it when editing is enabled', () => {
    const task = createTask({ label: 'Editable note' }, 'steve');
    const html = renderToStaticMarkup(
      <PostItBoard
        tasks={[task]}
        onToggle={async () => undefined}
        onUpdate={async () => undefined}
      />,
    );
    expect(html).toContain(`id="task-edit-trigger-postit-${task.id}"`);
    expect(html).toContain('Edit Editable note');
  });

  it('shows only the selected post-it fields', () => {
    const task = createTask(
      {
        label: 'Focused note',
        dueDate: '2026-12-31',
        dueKind: 'date',
        memo: 'Hide this memo',
        link: 'https://example.com/hidden',
        categoryId: 'calls',
      },
      'steve',
    );
    const html = renderToStaticMarkup(
      <PostItNote
        task={task}
        categoryName="Calls"
        currentUserId="steve"
        visibleFields={new Set(['priority'] as const)}
        complete={() => undefined}
      />,
    );
    expect(html).toContain('urgency-badge');
    expect(html).not.toContain('postit-due');
    expect(html).not.toContain('progress-indicator');
    expect(html).not.toContain('user-identity');
    expect(html).not.toContain('Calls');
    expect(html).not.toContain('Hide this memo');
    expect(html).not.toContain('example.com');
    expect(html).not.toContain('Start 10 minute timer');
  });

  it('keeps completed styling offline and defines reduced-motion and sound feedback', () => {
    const css = readFileSync(new URL('../../src/styles/app.css', import.meta.url), 'utf8');
    const feedback = readFileSync(
      new URL('../../src/features/tasks/useCompletionFeedback.ts', import.meta.url),
      'utf8',
    );
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('completion-label');
    expect(feedback).toContain('post-it-scrunch.ogg');
    expect(feedback).toContain('loadCompletionSound');
  });
});
