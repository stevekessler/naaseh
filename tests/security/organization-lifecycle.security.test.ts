import { describe, expect, it } from 'vitest';
import { reportingTelemetry } from '../../apps/api/src/reporting/telemetry.js';

describe('organization lifecycle boundaries', () => {
  it('keeps audits and telemetry content-free', () => {
    const detail = reportingTelemetry('completion-report.failure', {
      actorId: 'admin',
      targetUserId: 'owner',
    });
    expect(Object.keys(detail)).toEqual(['operation', 'actorId', 'targetUserId']);
    expect(JSON.stringify(detail)).not.toContain('PAAO');
  });
});
