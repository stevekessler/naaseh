import { describe, expect, it } from 'vitest';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';

describe('completion report contract', () => {
  it('returns bounded zero-filled personal buckets and historical filters', () => {
    const report = calculateCompletionReport([], {
      userId: 'owner',
      timeZone: 'UTC',
      period: 'day',
      from: '2026-07-01',
      to: '2026-07-03',
      categoryId: 'unassigned',
    });
    expect(report).toMatchObject({ userId: 'owner', total: 0 });
    expect(report.buckets).toHaveLength(3);
  });
});
