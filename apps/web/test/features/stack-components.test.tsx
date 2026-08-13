import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StackList, maximumRenderedStackRows } from '../../src/features/stacks/StackList.js';
import { StackMoveControls } from '../../src/features/stacks/StackMoveControls.js';
import { StackRow, stackRowFocusId } from '../../src/features/stacks/StackRow.js';
import { StackScopePicker } from '../../src/features/stacks/StackScopePicker.js';

const reference = (index: number, workType: 'task' | 'list' = 'task') => ({
  workType,
  workId: `01J0000000000000000000${String(index).padStart(3, '0')}`,
  membershipEpoch: `epoch-${String(index).padStart(3, '0')}`,
});
const item = {
  reference: reference(1),
  label: 'Call the dentist',
  urgency: 'extra_low' as const,
  overallPosition: 5,
  projectPosition: 1,
};

describe('personal stack component primitives', () => {
  it('renders native Overall and fully named Project choices', () => {
    const html = renderToStaticMarkup(
      <StackScopePicker
        scope={{ scopeType: 'overall' }}
        projects={[{ id: '01J00000000000000000000009', name: 'Home' }]}
        change={vi.fn()}
      />,
    );
    expect(html).toContain('aria-label="Stack scope"');
    expect(html).toContain('Overall stack');
    expect(html).toContain('Home Project stack');
  });

  it('shows mixed-work text urgency and independent dense positions', () => {
    const html = renderToStaticMarkup(
      <StackRow
        item={item}
        scope={{ scopeType: 'project', scopeId: '01J00000000000000000000009' }}
        total={2}
        move={vi.fn()}
      />,
    );
    expect(stackRowFocusId(item.reference)).toContain('personal-stack-row-task-');
    expect(html).toContain('Extra Low');
    expect(html).toContain('Project position 1 of 2');
    expect(html).toContain('Overall position 5');
    expect(html).toContain('aria-posinset="1"');
  });

  it('bounds the rendered mixed-work window to one hundred rows', () => {
    const items = Array.from({ length: 125 }, (_, index) => ({
      reference: reference(index + 1, index % 2 ? 'list' : 'task'),
      label: `Work ${index + 1}`,
      urgency: 'medium' as const,
      overallPosition: index + 1,
    }));
    const html = renderToStaticMarkup(
      <StackList items={items} scope={{ scopeType: 'overall' }} move={vi.fn()} windowSize={500} />,
    );
    expect(maximumRenderedStackRows).toBe(100);
    expect(html.match(/class="stack-row"/g)).toHaveLength(100);
    expect(html).toContain('Showing positions 1–100 of 125');
    expect(html).toContain('data-work-type="task"');
    expect(html).toContain('data-work-type="list"');
  });

  it('keeps canonical filtered ranks while using dense visible move positions', () => {
    const html = renderToStaticMarkup(
      <StackList
        items={[
          { ...item, overallPosition: 2 },
          {
            ...item,
            reference: reference(2),
            label: 'Write release notes',
            overallPosition: 5,
          },
        ]}
        scope={{ scopeType: 'overall' }}
        move={vi.fn()}
      />,
    );
    const movePositions = [...html.matchAll(/<input[^>]*aria-label="Position"[^>]*>/g)].map(
      (match) => Number(match[0].match(/value="(\d+)"/)?.[1]),
    );

    expect(html).toContain('Overall position 2');
    expect(html).toContain('Overall position 5');
    expect(html).not.toContain('Overall position 5 of 2');
    expect(movePositions).toEqual([1, 2]);
  });

  it('uses native controls with touch alternatives and stable focus return targets', () => {
    const html = renderToStaticMarkup(
      <StackMoveControls
        work={item.reference}
        label={item.label}
        position={2}
        total={3}
        move={vi.fn()}
      />,
    );
    const focusId = stackRowFocusId(item.reference);
    expect(html).toContain(`aria-label="Reorder ${item.label}"`);
    expect(html).toContain('aria-label="Move up"');
    expect(html).toContain('aria-label="Move down"');
    expect(html).toContain('aria-label="Position"');
    expect(html).toContain('>Apply position</button>');
    expect(html).toContain(`aria-controls="${focusId}"`);
    expect(html).toContain('data-touch-alternative="true"');
    expect(html).toContain('class="stack-move-controls"');
    expect(html).toContain('class="stack-position-editor"');
    expect(html.indexOf('Move up')).toBeLessThan(html.indexOf('Move down'));
    expect(html.indexOf('Move down')).toBeLessThan(html.indexOf('Move to position'));
  });

  it.each([
    [1, 1, true, true],
    [1, 3, true, false],
    [2, 3, false, false],
    [3, 3, false, true],
  ])('exposes non-color disabled states at position %s of %s', (position, total, up, down) => {
    const html = renderToStaticMarkup(
      <StackMoveControls
        work={item.reference}
        label={item.label}
        position={position}
        total={total}
        move={vi.fn()}
      />,
    );
    expect(/aria-label="Move up"[^>]*disabled/.test(html)).toBe(up);
    expect(/aria-label="Move down"[^>]*disabled/.test(html)).toBe(down);
  });
});
