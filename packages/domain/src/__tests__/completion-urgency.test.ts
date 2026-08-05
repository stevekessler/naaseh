import { describe, expect, it } from 'vitest';
import {
  completeAndArchiveTask,
  completionEventSchema,
  createTask,
  reverseCompletionEvent,
  workloadCountsSchema,
  zeroUrgencyCounts,
  zeroWorkloadCounts,
  type CompletionEvent,
} from '../index.js';

const eventId = '01K00000000000000000000050';
const taskId = '01K00000000000000000000030';
const occurredAt = '2026-08-05T12:00:00.000Z';

const eventValue = (urgencyAtCompletion?: string) => ({
  id: eventId,
  taskId,
  completedBy: 'owner',
  occurredAt,
  ...(urgencyAtCompletion ? { urgencyAtCompletion } : {}),
  counted: true,
  createdAt: occurredAt,
});

describe('completion urgency history', () => {
  it('requires one immutable urgency snapshot on every completion event', () => {
    expect(completionEventSchema.safeParse(eventValue()).success).toBe(false);
    expect(completionEventSchema.safeParse(eventValue('critical')).success).toBe(true);
    expect(completionEventSchema.safeParse(eventValue('urgent')).success).toBe(false);
  });

  it('captures current urgency at completion without following later work edits', () => {
    const task = createTask(
      { label: 'Historical urgency', urgency: 'critical' },
      'owner',
      new Date('2026-08-05T11:00:00.000Z'),
    );
    const completed = completeAndArchiveTask(
      task,
      'owner',
      {},
      new Date('2026-08-05T12:00:00.000Z'),
    );
    const laterTask = { ...completed.task, urgency: 'extra_low' as const };

    expect(completed.completionEvent).toMatchObject({ urgencyAtCompletion: 'critical' });
    expect(laterTask.urgency).toBe('extra_low');
    expect(
      (completed.completionEvent as CompletionEvent & { urgencyAtCompletion: string })
        .urgencyAtCompletion,
    ).toBe('critical');
  });

  it('retains the urgency snapshot when a completion is reversed', () => {
    const event = eventValue('high') as CompletionEvent & { urgencyAtCompletion: 'high' };
    const reversed = reverseCompletionEvent(
      event,
      'owner',
      'reverse-urgency-event',
      new Date('2026-08-06T12:00:00.000Z'),
    ) as CompletionEvent & { urgencyAtCompletion: 'high' };

    expect(reversed).toMatchObject({
      counted: false,
      urgencyAtCompletion: 'high',
      reversedAt: '2026-08-06T12:00:00.000Z',
    });
  });

  it('zero-fills all five urgency levels instead of omitting empty buckets', () => {
    expect(zeroUrgencyCounts()).toEqual({
      extra_low: 0,
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    });
    expect(workloadCountsSchema.parse(zeroWorkloadCounts())).toEqual({
      tasks: 0,
      lists: 0,
      urgencyCounts: {
        extra_low: 0,
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    });
    expect(
      workloadCountsSchema.safeParse({ tasks: 0, lists: 0, urgencyCounts: { medium: 0 } }).success,
    ).toBe(false);
  });
});
