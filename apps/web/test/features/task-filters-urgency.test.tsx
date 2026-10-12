import type { Urgency } from '@naaseh/domain';
import type { ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { filtersFromSearch } from '../../src/features/search/search-state.js';
import { dateRangeForPreset, TaskFilters } from '../../src/features/search/TaskFilters.js';
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

describe('TaskFilters urgency controls', () => {
  it('builds today, tomorrow, calendar-week, and calendar-month ranges', () => {
    const now = new Date(2026, 9, 6, 12);
    expect(dateRangeForPreset('today', now)).toEqual({
      from: '2026-10-06',
      to: '2026-10-06',
    });
    expect(dateRangeForPreset('tomorrow', now)).toEqual({
      from: '2026-10-07',
      to: '2026-10-07',
    });
    expect(dateRangeForPreset('week', now)).toEqual({
      from: '2026-10-04',
      to: '2026-10-10',
    });
    expect(dateRangeForPreset('nextWeek', now)).toEqual({
      from: '2026-10-11',
      to: '2026-10-17',
    });
    expect(dateRangeForPreset('nextNextWeek', now)).toEqual({
      from: '2026-10-18',
      to: '2026-10-24',
    });
    expect(dateRangeForPreset('month', now)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
  });
  it('renders four accessible multi-select urgency checkboxes with full labels', () => {
    const html = renderToStaticMarkup(
      <UrgencyTaskFilters value={value()} change={vi.fn()} resultCount={10} />,
    );

    expect(html.match(/type="checkbox"/g) ?? []).toHaveLength(4);
    for (const label of ['Low', 'Medium', 'High', 'Critical']) {
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

  it('does not render a separate priority clear button', () => {
    const html = renderToStaticMarkup(<PriorityFilter value={['low']} change={vi.fn()} />);
    expect(html).not.toContain('Clear urgency filters');
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
      <UrgencyTaskFilters value={value(['low'])} change={vi.fn()} resultCount={0} />,
    );
    expect(html).toContain('No work matches the selected urgency levels.');
    expect(html).not.toContain('Clear urgency filters');
  });
});
