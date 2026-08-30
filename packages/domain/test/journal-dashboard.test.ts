import { buildDashboardPeriod, calculateJournalDashboard } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';

const entry = (id: string, date: string, patch: Record<string, unknown>) => ({
  id,
  date,
  ...patch,
});
describe('journal dashboard calculations', () => {
  it('uses inclusive equal current/prior periods and answered-only contributors', () => {
    expect(buildDashboardPeriod('2026-08-23', '2026-08-29')).toEqual({
      start: '2026-08-23',
      end: '2026-08-29',
      comparisonStart: '2026-08-16',
      comparisonEnd: '2026-08-22',
    });
    const metrics = calculateJournalDashboard(
      [
        entry('a', '2026-08-29', { hoursOfSleep: 8, selfCare: true }),
        entry('b', '2026-08-28', { hoursOfSleep: null, selfCare: false }),
        entry('c', '2026-08-22', { hoursOfSleep: 6, selfCare: true }),
      ] as never,
      { start: '2026-08-23', end: '2026-08-29' },
      { suicidalSelfHarmEnabled: true },
    );
    expect(metrics.find((metric) => metric.metric === 'daysJournaled')).toMatchObject({
      value: 2,
      contributingEntryIds: ['a', 'b'],
    });
    expect(metrics.find((metric) => metric.metric === 'hoursOfSleep')).toMatchObject({
      value: 8,
      comparisonValue: 6,
      trend: 'up',
      contributingEntryIds: ['a'],
    });
    expect(metrics.find((metric) => metric.metric === 'selfCare')).toMatchObject({
      value: 1,
      comparisonValue: 1,
      trend: 'unchanged',
      contributingEntryIds: ['a', 'b'],
    });
  });

  it('distinguishes no data and hides sensitive cards', () => {
    const metrics = calculateJournalDashboard(
      [],
      { start: '2026-08-23', end: '2026-08-29' },
      { suicidalSelfHarmEnabled: false },
    );
    expect(metrics.find((metric) => metric.metric === 'hoursOfSleep')).toMatchObject({
      value: 'noData',
      trend: 'notComparable',
    });
    expect(metrics.some((metric) => metric.metric === 'suicidalThoughts')).toBe(false);
  });
});
