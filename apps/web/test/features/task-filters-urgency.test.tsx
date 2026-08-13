import type { Urgency } from '@naaseh/domain';
import { isValidElement, type ComponentType, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { filtersFromSearch } from '../../src/features/search/search-state.js';
import { TaskFilters } from '../../src/features/search/TaskFilters.js';
import type { Filters } from '../../src/search/task-search.js';
import { PriorityFilter } from '../../src/components/PriorityFilter.js';

type UrgencyFilters = Filters & { urgencies: Urgency[] };
type UrgencyTaskFiltersProps = {
  value: UrgencyFilters;
  change: (next: UrgencyFilters) => void;
  resultCount?: number;
};
const UrgencyTaskFilters = TaskFilters as unknown as ComponentType<UrgencyTaskFiltersProps>;

const value = (urgencies: Urgency[] = []): UrgencyFilters => ({
  query: '',
  from: '',
  to: '',
  assigneeId: '',
  categoryId: '',
  projectId: '',
  lifecycle: 'active',
  contentType: 'all',
  urgencies,
});

function findElement(
  node: ReactNode,
  predicate: (type: unknown, props: Record<string, unknown>) => boolean,
): { type: unknown; props: Record<string, unknown> } | undefined {
  if (!isValidElement(node)) return undefined;
  const props = node.props as Record<string, unknown>;
  if (predicate(node.type, props)) return { type: node.type, props };
  const children = props.children;
  const values = Array.isArray(children) ? children : [children];
  for (const child of values) {
    const match = findElement(child as ReactNode, predicate);
    if (match) return match;
  }
  return undefined;
}

describe('TaskFilters urgency controls', () => {
  it('renders five accessible multi-select urgency checkboxes with full labels', () => {
    const html = renderToStaticMarkup(
      <UrgencyTaskFilters value={value()} change={vi.fn()} resultCount={10} />,
    );

    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(5);
    for (const label of ['Extra Low', 'Low', 'Medium', 'High', 'Critical']) {
      expect(html).toContain(label);
    }
    expect(html).toContain('aria-label="Urgency levels"');
  });

  it('summarizes all selected levels using full urgency names', () => {
    const html = renderToStaticMarkup(
      <UrgencyTaskFilters value={value(['high', 'critical'])} change={vi.fn()} resultCount={3} />,
    );
    expect(html).toContain('2 urgency levels selected: High, Critical');
  });

  it('clears only urgency selections and preserves every other active filter', () => {
    const change = vi.fn();
    const selected: UrgencyFilters = {
      ...value(['low', 'critical']),
      from: '2026-08-01',
      projectId: 'project-a',
    };
    const tree = PriorityFilter({
      value: selected.urgencies,
      change: (urgencies) => change({ ...selected, urgencies }),
    }) as ReactNode;
    const clear = findElement(
      tree,
      (type, props) => type === 'button' && props['aria-label'] === 'Clear urgency filters',
    );

    expect(clear).toBeDefined();
    (clear?.props.onClick as (() => void) | undefined)?.();
    expect(change).toHaveBeenCalledWith({ ...selected, urgencies: [] });
  });

  it('restores checked urgency choices from saved URL state', () => {
    const saved = filtersFromSearch('?urgencies=high,critical') as UrgencyFilters;
    const html = renderToStaticMarkup(
      <UrgencyTaskFilters value={saved} change={vi.fn()} resultCount={2} />,
    );

    expect(html).toMatch(/<input(?=[^>]*value="high")(?=[^>]*checked="")[^>]*>/);
    expect(html).toMatch(/<input(?=[^>]*value="critical")(?=[^>]*checked="")[^>]*>/);
  });

  it('shows an actionable zero-result message for selected urgency levels', () => {
    const html = renderToStaticMarkup(
      <UrgencyTaskFilters value={value(['extra_low'])} change={vi.fn()} resultCount={0} />,
    );
    expect(html).toContain('No work matches the selected urgency levels.');
    expect(html).toContain('Clear urgency filters');
  });
});
