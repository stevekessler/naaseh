import { describe, expect, it } from 'vitest';
import { calculateWorkloadTree } from '../../apps/web/src/db/workload-selector.js';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';
import type { CompletionEvent } from '@naaseh/domain';

describe('integrated archive/project/reporting scale', () => {
  it('calculates a 50k-work/1k-node tree and 50k events under one second each', () => {
    const projects = Array.from({ length: 1_000 }, (_, index) => ({
      id: `p-${index}`,
      categoryId: `c-${index % 100}`,
    }));
    const work = Array.from({ length: 50_000 }, (_, index) => ({
      kind: index % 2 ? ('task' as const) : ('list' as const),
      lifecycle: 'active' as const,
      projectId: projects[index % 1_000]!.id,
    }));
    let started = performance.now();
    expect(calculateWorkloadTree(projects, work).projects.size).toBe(1_000);
    expect(performance.now() - started).toBeLessThan(1_000);
    const events = Array.from(
      { length: 50_000 },
      (_, index): CompletionEvent => ({
        id: `01J${String(index).padStart(23, '0')}`,
        taskId: `01K${String(index).padStart(23, '0')}`,
        completedBy: 'owner',
        occurredAt: `2026-07-${String((index % 30) + 1).padStart(2, '0')}T12:00:00.000Z`,
        urgencyAtCompletion: 'medium',
        counted: true,
        createdAt: '2026-07-01T00:00:00.000Z',
      }),
    );
    started = performance.now();
    expect(
      calculateCompletionReport(events, {
        userId: 'owner',
        timeZone: 'UTC',
        period: 'month',
        from: '2026-07-01',
        to: '2026-07-31',
      }).total,
    ).toBe(50_000);
    expect(performance.now() - started).toBeLessThan(1_000);
  });
});
