import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CompletionFilters } from '../../src/features/reports/CompletionFilters.js';
import { StackMoveControls } from '../../src/features/stacks/StackMoveControls.js';

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
});
