import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PersonalStackPage } from '../../src/features/stacks/PersonalStackPage.js';
import { StackMoveControls } from '../../src/features/stacks/StackMoveControls.js';
import { stackRowFocusId } from '../../src/features/stacks/StackRow.js';
import { StackScopePicker } from '../../src/features/stacks/StackScopePicker.js';

const projectId = '01J00000000000000000000009';
const task = {
  reference: {
    workType: 'task' as const,
    workId: '01J00000000000000000000001',
    membershipEpoch: 'epoch-task',
  },
  label: 'Call the dentist',
  urgency: 'high' as const,
  overallPosition: 2,
  projectPosition: 1,
};
const list = {
  reference: {
    workType: 'list' as const,
    workId: '01J00000000000000000000002',
    membershipEpoch: 'epoch-list',
  },
  label: 'Camping supplies',
  urgency: 'extra_low' as const,
  overallPosition: 1,
  projectPosition: 2,
};
const projects = [{ id: projectId, name: 'Home' }];

describe('personal stack accessibility contract', () => {
  it('uses a native keyboard-selectable Overall/Project scope control with full names', () => {
    const overallHtml = renderToStaticMarkup(
      <StackScopePicker scope={{ scopeType: 'overall' }} projects={projects} change={vi.fn()} />,
    );
    const projectHtml = renderToStaticMarkup(
      <StackScopePicker
        scope={{ scopeType: 'project', scopeId: projectId }}
        projects={projects}
        change={vi.fn()}
      />,
    );

    expect(overallHtml).toContain('<select');
    expect(overallHtml).toContain('aria-label="Stack scope"');
    expect(overallHtml).toContain('value="overall" selected=""');
    expect(overallHtml).toContain('>Overall stack<');
    expect(overallHtml).toContain(`value="project:${projectId}"`);
    expect(overallHtml).toContain('>Home Project stack<');
    expect(projectHtml).toContain(`value="project:${projectId}" selected=""`);
  });

  it('announces one-based positions and names the applicable independent scope', () => {
    const html = renderToStaticMarkup(
      <PersonalStackPage
        scope={{ scopeType: 'project', scopeId: projectId }}
        projects={projects}
        items={[task, list]}
        announcement="Moved Call the dentist to position 1 of 2 in Home Project stack."
        pendingOperationIds={[]}
        conflictCount={0}
        changeScope={vi.fn()}
        move={vi.fn()}
      />,
    );

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('aria-atomic="true"');
    expect(html).toContain('Moved Call the dentist to position 1 of 2 in Home Project stack.');
    expect(html).toContain('Project position 1 of 2');
    expect(html).toContain('Overall position 2');
    expect(html).toContain('Extra Low');
  });

  it('provides native keyboard Move up/down/to-position controls and touch alternatives', () => {
    const html = renderToStaticMarkup(
      <StackMoveControls
        work={task.reference}
        label={task.label}
        position={2}
        total={3}
        move={vi.fn()}
      />,
    );

    expect(html).toContain(`aria-label="Reorder ${task.label}"`);
    expect(html).toContain('aria-label="Move up"');
    expect(html).toContain('aria-label="Move down"');
    expect(html).toContain('aria-label="Position"');
    expect(html).toContain('type="number"');
    expect(html).toContain('min="1"');
    expect(html).toContain('max="3"');
    expect(html).toContain('>Apply position</button>');
    expect(html).toContain('type="button"');
    expect(html).toContain('data-touch-alternative="true"');
  });

  it('defines a stable row focus target that controls restore after every move', () => {
    const focusId = stackRowFocusId(task.reference);
    const html = renderToStaticMarkup(
      <PersonalStackPage
        scope={{ scopeType: 'overall' }}
        projects={projects}
        items={[list, task]}
        announcement="Moved Call the dentist up to position 1 of 2 in Overall stack."
        pendingOperationIds={['01J00000000000000000000010']}
        conflictCount={0}
        changeScope={vi.fn()}
        move={vi.fn()}
      />,
    );

    expect(focusId).toBe(`personal-stack-row-task-${task.reference.workId}`);
    expect(html).toContain(`id="${focusId}"`);
    expect(html).toContain(`aria-controls="${focusId}"`);
    expect(html).toContain(`data-focus-return="${focusId}"`);
    expect(html).toContain('1 change pending synchronization');
  });
});
