import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { UrgencyBadge } from '../../src/components/UrgencyBadge.js';
import { resolveVisibleStackDrop, StackList } from '../../src/features/stacks/StackList.js';
import { stackDragId } from '../../src/features/stacks/StackRow.js';

const items = ['low', 'medium', 'high', 'critical'].map((urgency, index) => ({
  reference: {
    workType: 'task' as const,
    workId: `01J0000000000000000000000${index + 1}`,
    membershipEpoch: `epoch-${index + 1}`,
  },
  label: `Work ${index + 1}`,
  urgency: urgency as 'low' | 'medium' | 'high' | 'critical',
  overallPosition: index + 1,
}));

describe('stack drag and compact priority accessibility', () => {
  it('renders pointer/touch handles while retaining canonical keyboard controls and instructions', () => {
    const html = renderToStaticMarkup(
      <StackList items={items} scope={{ scopeType: 'overall' }} move={vi.fn()} />,
    );
    expect(html.match(/aria-label="Drag Work/g)).toHaveLength(4);
    expect(html).toContain('Drag to another visible position');
    expect(html).toContain('aria-label="Move up"');
    expect(html).toContain('aria-label="Move down"');
    expect(html).toContain('aria-label="Position"');
  });

  it('translates only valid visible non-self drops into one-based filtered positions', () => {
    expect(
      resolveVisibleStackDrop(
        items,
        stackDragId(items[0]!.reference),
        stackDragId(items[2]!.reference),
        10,
      ),
    ).toEqual({ work: items[0]!.reference, destinationPosition: 13 });
    expect(
      resolveVisibleStackDrop(items, 'outside', stackDragId(items[1]!.reference)),
    ).toBeUndefined();
    expect(
      resolveVisibleStackDrop(
        items,
        stackDragId(items[1]!.reference),
        stackDragId(items[1]!.reference),
      ),
    ).toBeUndefined();
  });

  it('uses distinct non-color compact glyphs, accessible names, and reduced-motion styles', () => {
    const html = items
      .map(({ urgency }) => renderToStaticMarkup(<UrgencyBadge urgency={urgency} mode="compact" />))
      .join('');
    for (const label of ['Low', 'Medium', 'High', 'Critical'])
      expect(html).toContain(`aria-label="Priority: ${label}"`);
    for (const glyph of ['○', '◆', '▲', '!']) expect(html).toContain(glyph);
    const css = readFileSync('apps/web/src/styles/app.css', 'utf8');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('.stack-row--drop-target');
  });
});
