import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createTask, transitionTask } from '@naaseh/domain';
import { PostItBoard } from '../../src/features/postit/PostItBoard.js';
import { ViewSwitcher } from '../../src/features/tasks/ViewSwitcher.js';
import { rememberTaskView, restoreTaskView } from '../../src/features/tasks/task-view-state.js';
import { readFileSync } from 'node:fs';

describe('post-it task view', () => {
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
        onToggle={async () => undefined}
      />,
    );
    expect(html).toContain('class="postit crumpled"');
    expect(html).toContain('background:#06366b;color:#ffffff');
    expect(html).toContain('aria-label="Reopen Open task"');
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
