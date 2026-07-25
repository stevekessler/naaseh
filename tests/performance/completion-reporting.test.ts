import { describe, expect, it } from 'vitest';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';
import type { CompletionEvent } from '@naaseh/domain';

describe('completion reporting performance', () => {
  it('buckets and filters 50,000 events in under one second', () => {
    const events = Array.from(
      { length: 50_000 },
      (_, index): CompletionEvent => ({
        id: `01J${String(index).padStart(23, '0')}`,
        taskId: `01K${String(index).padStart(23, '0')}`,
        completedBy: 'owner',
        occurredAt: `2026-07-${String((index % 30) + 1).padStart(2, '0')}T12:00:00.000Z`,
        counted: true,
        createdAt: '2026-07-01T12:00:00.000Z',
      }),
    );
    const started = performance.now();
    const result = calculateCompletionReport(events, {
      userId: 'owner',
      timeZone: 'America/Denver',
      period: 'day',
      from: '2026-07-01',
      to: '2026-07-31',
    });
    expect(performance.now() - started).toBeLessThan(1_000);
    expect(result.total).toBe(50_000);
  });
});
