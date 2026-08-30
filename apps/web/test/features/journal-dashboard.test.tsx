import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { JournalMetricCard } from '../../src/features/journal/JournalMetricCard.js';

describe('journal dashboard components', () => {
  it('renders a semantic square button with value kind and color-independent trend text', () => {
    const html = renderToStaticMarkup(
      <JournalMetricCard
        metric={{
          metric: 'hoursOfSleep',
          kind: 'average',
          value: 7.5,
          comparisonValue: 6.5,
          trend: 'up',
          contributingEntryIds: ['entry'],
        }}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain('<button');
    expect(html).toContain('7.5');
    expect(html).toContain('average');
    expect(html).toContain('Increased');
  });
  it('announces no data without converting it to zero', () => {
    const html = renderToStaticMarkup(
      <JournalMetricCard
        metric={{
          metric: 'selfCare',
          kind: 'yesDayCount',
          value: 'noData',
          comparisonValue: 'noData',
          trend: 'notComparable',
          contributingEntryIds: [],
        }}
        onOpen={() => undefined}
      />,
    );
    expect(html).toContain('No data');
    expect(html).toContain('Not comparable');
  });
});
