import { describe, expect, it } from 'vitest';
import type { CompletionEvent } from '@naaseh/domain';
import {
  bucketCompletionEvents,
  localDateKey,
} from '../../src/features/reports/completion-bucketing.js';

const event = (
  id: string,
  occurredAt: string,
  patch: Partial<CompletionEvent> = {},
): CompletionEvent => ({
  id: id.padEnd(26, '0'),
  taskId: id.padEnd(26, '1'),
  completedBy: 'owner',
  occurredAt,
  counted: true,
  createdAt: occurredAt,
  ...patch,
});

describe('completion bucketing', () => {
  it('uses IANA local dates through DST gaps and overlaps', () => {
    expect(localDateKey('2026-03-08T07:30:00.000Z', 'America/Denver')).toBe('2026-03-08');
    expect(localDateKey('2026-11-01T07:30:00.000Z', 'America/Denver')).toBe('2026-11-01');
  });

  it('zero-fills days and preserves total equality for counted filtered history', () => {
    const result = bucketCompletionEvents(
      [
        event('01J00000000000000000000100', '2026-03-08T08:30:00.000Z'),
        event('01J00000000000000000000101', '2026-03-09T08:30:00.000Z', {
          counted: false,
          reversedAt: '2026-03-10T00:00:00.000Z',
          reversedBy: 'owner',
          reversalMutationId: 'r1',
        }),
      ],
      { timeZone: 'America/Denver', period: 'day', from: '2026-03-07', to: '2026-03-10' },
    );
    expect(result.buckets).toHaveLength(4);
    expect(result.total).toBe(1);
    expect(result.buckets.reduce((sum, bucket) => sum + bucket.count, 0)).toBe(result.total);
  });

  it('supports week-start and month/year boundaries', () => {
    const weekly = bucketCompletionEvents(
      [event('01J00000000000000000000102', '2026-01-01T12:00:00.000Z')],
      { timeZone: 'UTC', period: 'week', weekStartsOn: 1, from: '2025-12-29', to: '2026-01-04' },
    );
    expect(weekly.buckets).toEqual([{ key: '2025-12-29', count: 1 }]);
    const monthly = bucketCompletionEvents(
      [event('01J00000000000000000000103', '2026-01-01T00:00:00.000Z')],
      { timeZone: 'UTC', period: 'month', from: '2025-12-31', to: '2026-01-01' },
    );
    expect(monthly.buckets.map((bucket) => bucket.key)).toEqual(['2025-12', '2026-01']);
  });
});
