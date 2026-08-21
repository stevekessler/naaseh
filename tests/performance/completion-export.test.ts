import { describe, expect, it } from 'vitest';
import { transformCompletedTasksToCsv } from '../../apps/api/src/exports/csv-transformer.js';

describe('completion export throughput', () => {
  it('formats 10,000 bounded rows within two seconds', () => {
    const tasks = Array.from({ length: 10_000 }, (_, index) => ({
      id: `task-${String(index).padStart(5, '0')}`,
      ownerId: 'owner',
      label: `Task ${index}`,
      memo: '',
      memoHidden: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      completedAt: '2026-01-02T00:00:00.000Z',
      completedBy: 'owner',
      visibility: 'public',
      urgency: 'medium',
      status: 'completed',
      version: 1,
    })) as any;
    const started = performance.now();
    const csv = transformCompletedTasksToCsv(tasks, new Map(), {
      asOf: '2026-01-03T00:00:00.000Z',
    });
    expect(performance.now() - started).toBeLessThan(2_000);
    expect(csv.match(/\r\n/gu)).toHaveLength(10_001);
  });
});
