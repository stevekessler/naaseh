import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompletionFilters } from '../../src/features/reports/CompletionFilters.js';
import { StackMoveControls } from '../../src/features/stacks/StackMoveControls.js';
import { ProjectTree } from '../../src/features/projects/ProjectTree.js';

describe('responsive markup contracts', () => {
  it('exposes stable field-grid and stack action hooks without changing DOM order', () => {
    const filters = renderToStaticMarkup(
      <CompletionFilters
        value={{
          period: 'day',
          categoryId: '',
          projectId: '',
          timeZone: 'UTC',
          weekStartsOn: 0,
          urgencies: [],
        }}
        categories={[]}
        projects={[]}
        change={vi.fn()}
      />,
    );
    const stack = renderToStaticMarkup(
      <StackMoveControls
        work={{ workType: 'task', workId: 'task', membershipEpoch: 'epoch' }}
        label="Task"
        position={1}
        total={2}
        move={vi.fn()}
      />,
    );
    expect(filters).toContain('class="completion-filters"');
    expect(stack).toContain('class="stack-move-controls"');
    expect(stack).toContain('class="stack-position-editor"');
  });

  it('labels categories separately from their child projects', () => {
    const html = renderToStaticMarkup(
      <ProjectTree
        tree={{
          asOf: '2026-08-13T00:00:00.000Z',
          categories: [
            {
              category: {
                id: 'personal',
                name: 'Personal',
                color: '#36a83f',
                lifecycle: 'active',
                createdAt: '2026-08-13T00:00:00.000Z',
                updatedAt: '2026-08-13T00:00:00.000Z',
                version: 1,
              },
              count: { taskCount: 0, listCount: 0 },
              projects: [],
            },
          ],
          unassigned: { taskCount: 0, listCount: 0 },
        }}
      />,
    );
    expect(html).toContain('Categories and Projects');
    expect(html).toContain('Category: Personal');
    expect(html).toContain('No projects in this category.');
    expect(html).toContain('Unassigned to a project');
  });
});
