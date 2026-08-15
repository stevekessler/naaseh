import { describe, expect, it, vi } from 'vitest';
import { pushRequestSchema } from '@naaseh/contracts';
import type { TaskTimer } from '@naaseh/domain';
import { buildTaskTimerTransaction } from '../../src/timers/task-timer-repository.js';
import { createTaskTimerService } from '../../src/timers/task-timer-service.js';
import { dispatchTaskTimerSyncMutation } from '../../src/sync/sync-service.js';

const ownerId = '01J00000000000000000000001';
const taskId = '01J00000000000000000000002';
const mutationId = '01J00000000000000000000003';
const commandMutation = {
  id: mutationId,
  entityId: ownerId,
  entityType: 'taskTimer' as const,
  operation: 'timerCommand' as const,
  baseVersion: 0,
  payload: { type: 'start' as const, taskId },
  createdAt: '2026-08-14T12:00:00.000Z',
  attempts: 0,
};

function memoryService() {
  let current: TaskTimer | undefined;
  const receipts = new Map<string, { mutationId: string; status: 'applied'; version: number }>();
  let commits = 0;
  const service = createTaskTimerService({
    repository: {
      load: async () => current,
      findReceipt: async (_owner, id) => receipts.get(id),
      feedSequence: async () => commits,
      commit: async (input) => {
        if ((current?.version ?? 0) !== input.baseVersion) return false;
        current = input.timer;
        receipts.set(input.mutationId, {
          mutationId: input.mutationId,
          status: 'applied',
          version: input.timer.version,
        });
        commits += 1;
      },
    },
    canReadTask: async (_owner, id) => id === taskId,
    now: () => new Date('2026-08-14T12:00:00.000Z'),
    newRunId: () => '01J00000000000000000000004',
  });
  return { service, current: () => current, commits: () => commits };
}

describe('task timer sync v5', () => {
  it('accepts timer commands only in sync contract version 5', () => {
    expect(
      pushRequestSchema.safeParse({ contractVersion: 5, mutations: [commandMutation] }).success,
    ).toBe(true);
    expect(
      pushRequestSchema.safeParse({ contractVersion: 4, mutations: [commandMutation] }).success,
    ).toBe(false);
  });

  it('uses deterministic owner identity, receipts, and one owner feed transaction', async () => {
    const state = memoryService();
    const first = await dispatchTaskTimerSyncMutation({
      actorId: ownerId,
      sourceClientId: 'browser-a',
      mutation: commandMutation,
      service: state.service,
    });
    const replay = await dispatchTaskTimerSyncMutation({
      actorId: ownerId,
      sourceClientId: 'browser-a',
      mutation: commandMutation,
      service: state.service,
    });
    expect(first).toMatchObject({ status: 'applied', version: 1 });
    expect(replay).toMatchObject({ status: 'duplicate', version: 1 });
    expect(state.current()).toMatchObject({ id: ownerId, ownerId, taskId });
    expect(state.commits()).toBe(1);

    const transaction = buildTaskTimerTransaction({
      ownerId,
      mutationId,
      baseVersion: 0,
      timer: state.current()!,
      expectedFeedSequence: 0,
    });
    expect(transaction.TransactItems).toHaveLength(5);
    expect(JSON.stringify(transaction)).toContain(`USER#${ownerId}`);
    expect(JSON.stringify(transaction)).not.toContain('PUBLIC');
    expect(JSON.stringify(transaction)).not.toContain('GROUP#');
  });

  it('returns safe version and authorization conflicts without leaking timer state', async () => {
    const state = memoryService();
    await state.service.execute({
      actorId: ownerId,
      ownerId,
      mutationId,
      sourceClientId: 'browser-a',
      baseVersion: 0,
      command: { type: 'start', taskId },
    });
    const conflict = await state.service.execute({
      actorId: ownerId,
      ownerId,
      mutationId: '01J00000000000000000000005',
      sourceClientId: 'browser-b',
      baseVersion: 0,
      command: { type: 'pause' },
    });
    const denied = await state.service.execute({
      actorId: 'another-user',
      ownerId,
      mutationId: '01J00000000000000000000006',
      sourceClientId: 'browser-b',
      baseVersion: 1,
      command: { type: 'pause' },
    });
    expect(conflict).toMatchObject({ status: 'conflict', reason: 'version_mismatch', version: 1 });
    expect(denied).toEqual({ status: 'rejected', reason: 'authorization_changed', version: 1 });
    expect(vi.mocked).toBeDefined();
  });
});
