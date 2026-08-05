import { describe, expect, it } from 'vitest';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';
import type { CompletionEvent } from '@naaseh/domain';

const base: CompletionEvent = {
  id: '01J00000000000000000000110',
  taskId: '01J00000000000000000000111',
  completedBy: 'owner',
  occurredAt: '2026-07-01T12:00:00.000Z',
  urgencyAtCompletion: 'medium',
  projectIdAtCompletion: '01J00000000000000000000020',
  projectNameAtCompletion: 'API',
  categoryIdAtCompletion: '01J00000000000000000000010',
  categoryNameAtCompletion: 'PAAO',
  counted: true,
  createdAt: '2026-07-01T12:00:00.000Z',
};

describe('completion projection behavior', () => {
  it('uses immutable completion-time attribution and excludes reversals', () => {
    const reversed: CompletionEvent = {
      ...base,
      id: '01J00000000000000000000112',
      counted: false,
      reversedAt: '2026-07-02T00:00:00.000Z',
      reversedBy: 'owner',
      reversalMutationId: 'r1',
    };
    const result = calculateCompletionReport([base, reversed], {
      userId: 'owner',
      timeZone: 'UTC',
      period: 'month',
      from: '2026-07-01',
      to: '2026-07-31',
      projectId: base.projectIdAtCompletion!,
    });
    expect(result.total).toBe(1);
    expect(result.events[0]?.projectNameAtCompletion).toBe('API');
  });
});
