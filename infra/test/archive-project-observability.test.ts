import { describe, expect, it } from 'vitest';
import { retention } from '../lib/observability-stack.js';
import { redact } from '@naaseh/observability';

describe('archive/project/reporting observability', () => {
  it('retains application logs for 30 days, audit/recovery for 90, and strips protected detail', () => {
    expect(retention).toMatchObject({ applicationDays: 30, auditDays: 90, recoveryDays: 90 });
    const safe = redact({
      operation: 'report',
      actorId: 'owner',
      taskName: 'secret',
      projectName: 'API',
    });
    expect(JSON.stringify(safe)).not.toMatch(/secret|API/);
  });
});
