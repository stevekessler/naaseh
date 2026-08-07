import { describe, expect, it } from 'vitest';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';
import { reportingTelemetry } from '../../apps/api/src/reporting/telemetry.js';

describe('completion report security', () => {
  it('does not count another user and telemetry excludes content and organization names', () => {
    const result = calculateCompletionReport(
      [
        {
          id: '01J00000000000000000000120',
          taskId: '01J00000000000000000000121',
          completedBy: 'other',
          occurredAt: '2026-07-01T00:00:00.000Z',
          urgencyAtCompletion: 'medium',
          counted: true,
          createdAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      { userId: 'owner', timeZone: 'UTC', period: 'day', from: '2026-07-01', to: '2026-07-01' },
    );
    expect(result.total).toBe(0);
    const telemetry = JSON.stringify(
      reportingTelemetry('completion-report.success', {
        actorId: 'owner',
        targetUserId: 'owner',
      }),
    );
    expect(telemetry).not.toMatch(/title|projectName|categoryName|owner/);
  });
});
