import { describe, expect, it, vi } from 'vitest';
import type { CompletionEvent, List, Task } from '@naaseh/domain';
import { calculateCompletionReport } from '../../apps/api/src/reporting/completion-report-service.js';
import * as workloadReporting from '../../apps/api/src/reporting/workload-projection-repository.js';

const archive = vi.hoisted(() => ({
  tasks: [] as Task[],
  lists: [] as Array<{ list: List; items: [] }>,
}));

vi.mock('../../apps/api/src/lifecycle/archive-repository.js', () => ({
  scanArchivedWork: vi.fn(async () => archive),
  queryArchivedWork: vi.fn(async () => archive),
}));

type UrgencyLevel = 'extra_low' | 'low' | 'medium' | 'high' | 'critical';

const completion = (overrides: Record<string, unknown> = {}) =>
  ({
    id: '01J00000000000000000000110',
    taskId: '01J00000000000000000000111',
    completedBy: 'owner',
    occurredAt: '2026-08-01T12:00:00.000Z',
    counted: true,
    urgencyAtCompletion: 'critical',
    createdAt: '2026-08-01T12:00:00.000Z',
    ...overrides,
  }) as unknown as CompletionEvent;

describe('urgency reporting semantics', () => {
  it('uses immutable completion-time urgency after the current work urgency changes', () => {
    const currentTask = { urgency: 'extra_low' };
    const report = calculateCompletionReport([completion()], {
      userId: 'owner',
      timeZone: 'UTC',
      period: 'month',
      from: '2026-08-01',
      to: '2026-08-31',
    }) as ReturnType<typeof calculateCompletionReport> & {
      urgencyBreakdown: Record<UrgencyLevel, number>;
    };

    expect(currentTask.urgency).toBe('extra_low');
    expect(report.urgencyBreakdown).toEqual({
      extra_low: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 1,
    });
  });

  it('excludes a reversed completion without mutating its captured urgency', () => {
    const reversed = completion({
      counted: false,
      reversedAt: '2026-08-02T12:00:00.000Z',
      reversedBy: 'owner',
      reversalMutationId: 'reverse-1',
    });
    const report = calculateCompletionReport([reversed], {
      userId: 'owner',
      timeZone: 'UTC',
      period: 'day',
      from: '2026-08-01',
      to: '2026-08-02',
    }) as ReturnType<typeof calculateCompletionReport> & {
      urgencyBreakdown: Record<UrgencyLevel, number>;
    };

    expect(
      (reversed as CompletionEvent & { urgencyAtCompletion: string }).urgencyAtCompletion,
    ).toBe('critical');
    expect(report.total).toBe(0);
    expect(report.urgencyBreakdown).toEqual({
      extra_low: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    });
  });

  it('uses current urgency for workload totals and zero-fills every level', () => {
    const calculate = (
      workloadReporting as unknown as {
        calculateWorkloadUrgencyBreakdown?: (
          work: Array<{ urgency: string; lifecycle: string }>,
        ) => Record<string, number>;
      }
    ).calculateWorkloadUrgencyBreakdown;

    expect(calculate).toBeTypeOf('function');
    expect(
      calculate?.([
        { urgency: 'low', lifecycle: 'active' },
        { urgency: 'critical', lifecycle: 'active' },
        { urgency: 'high', lifecycle: 'archived' },
      ]),
    ).toEqual({ extra_low: 0, low: 1, medium: 0, high: 0, critical: 1 });
  });

  it('filters archive rows by their current urgency after post-completion edits', async () => {
    const base = {
      id: '01J00000000000000000000111',
      ownerId: 'owner',
      label: 'Archived',
      memo: '',
      memoHidden: false,
      createdAt: '2026-08-01T12:00:00.000Z',
      updatedAt: '2026-08-03T12:00:00.000Z',
      visibility: 'private',
      status: 'archived',
      lifecycle: 'archived',
      completionState: 'open',
      archiveReason: 'manual',
      version: 2,
    } as const;
    archive.tasks = [
      { ...base, urgency: 'extra_low' },
      { ...base, id: '01J00000000000000000000112', urgency: 'critical' },
    ] as Task[];
    const { listAuthorizedArchive } = await import(
      '../../apps/api/src/lifecycle/archive-service.js'
    );
    const result = await listAuthorizedArchive(
      { id: 'owner', role: 'user', active: true, groupIds: [] },
      { urgencies: ['critical'] } as Parameters<typeof listAuthorizedArchive>[1],
    );

    expect(result.tasks.map((task) => task.urgency)).toEqual(['critical']);
  });
});
