import { calculateJournalDashboard } from '@naaseh/domain';
import { describe, expect, it } from 'vitest';
import { journalListModel } from '../../apps/web/src/features/journal/journal-list-model.js';

describe('local-only journal performance', () => {
  it('processes 10,000 encrypted-projection views without new AWS capacity', () => {
    const entries = Array.from({ length: 10_000 }, (_, index) => ({
      id: crypto.randomUUID(),
      date: `2026-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
      hoursOfSleep: (index % 10) + 1,
      selfCare: index % 2 === 0,
      emotions: {},
    }));
    const started = performance.now();
    expect(journalListModel(entries as never, {})).toHaveLength(10_000);
    expect(
      calculateJournalDashboard(
        entries,
        { start: '2026-01-01', end: '2026-12-31' },
        { suicidalSelfHarmEnabled: true },
      ),
    ).not.toHaveLength(0);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
