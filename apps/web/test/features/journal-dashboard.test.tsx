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
    expect(html).toContain('Hours of sleep');
    expect(html).toContain('7.5');
    expect(html).toContain('Average');
    expect(html).toContain('Increased');
    expect(html).not.toContain('hoursOfSleep');
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
    expect(html).toContain('Self-care');
    expect(html).toContain('Yes days');
    expect(html).toContain('No data');
    expect(html).toContain('Not comparable');
    expect(html).not.toContain('>yesDayCount<');
  });

  it('shows decimals only for sleep, whose number line supports half-hour values', () => {
    const joy = renderToStaticMarkup(
      <JournalMetricCard
        metric={{
          metric: 'joy',
          kind: 'average',
          value: 50,
          comparisonValue: 'noData',
          trend: 'notComparable',
          contributingEntryIds: ['entry'],
        }}
        onOpen={() => undefined}
      />,
    );
    const sleep = renderToStaticMarkup(
      <JournalMetricCard
        metric={{
          metric: 'hoursOfSleep',
          kind: 'average',
          value: 8.5,
          comparisonValue: 'noData',
          trend: 'notComparable',
          contributingEntryIds: ['entry'],
        }}
        onOpen={() => undefined}
      />,
    );

    expect(joy).toContain('Joy: 50;');
    expect(joy).not.toContain('50.0');
    expect(sleep).toContain('Hours of sleep: 8.5;');
  });
});
