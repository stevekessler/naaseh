import { describe, expect, it, vi } from 'vitest';
import { canReadTaskAs, createTask } from '@naaseh/domain';
import { createTaskTimerService } from '../../apps/api/src/timers/task-timer-service.js';
import { revalidateProtectedSession } from '../../apps/web/src/features/auth/session.js';
import { purgeRevokedSessionData } from '../../apps/web/src/sync/privacy-purge.js';

describe('task security modernization collaboration boundaries', () => {
  it('grants group task reads only after membership and removes them on revocation', () => {
    const task = createTask({ label: 'Shared', groupId: 'group-1' }, 'owner');
    const actor = { id: 'member', role: 'user' as const, active: true };

    expect(canReadTaskAs(task, { ...actor, groupIds: [] }).allowed).toBe(false);
    expect(canReadTaskAs(task, { ...actor, groupIds: ['group-1'] }).allowed).toBe(true);
    expect(canReadTaskAs(task, { ...actor, groupIds: [] }).allowed).toBe(false);
  });

  it('keeps locked task ownership authoritative even for members and administrators', () => {
    const task = createTask(
      { label: 'Owner only', groupId: 'group-1', visibility: 'private' },
      'owner',
    );
    expect(
      canReadTaskAs(task, {
        id: 'member',
        role: 'user',
        active: true,
        groupIds: ['group-1'],
      }).allowed,
    ).toBe(false);
    expect(
      canReadTaskAs(task, { id: 'admin', role: 'admin', active: true, groupIds: [] }).privileged,
    ).toBe(true);
  });

  it('keeps timer mutation private to its owner and rechecks task authorization', async () => {
    const service = createTaskTimerService({
      repository: {
        load: vi.fn(async () => undefined),
        findReceipt: vi.fn(async () => undefined),
        feedSequence: vi.fn(async () => 0),
        commit: vi.fn(async () => true),
      },
      canReadTask: vi.fn(async () => false),
      now: () => new Date('2026-08-14T12:00:00.000Z'),
      newRunId: () => 'run-1',
    });

    await expect(
      service.execute({
        actorId: 'collaborator',
        ownerId: 'owner',
        mutationId: 'mutation-1',
        sourceClientId: 'client-1',
        baseVersion: 0,
        command: { type: 'start', taskId: 'task-1' },
      }),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'authorization_changed' });
    await expect(
      service.execute({
        actorId: 'owner',
        ownerId: 'owner',
        mutationId: 'mutation-2',
        sourceClientId: 'client-1',
        baseVersion: 0,
        command: { type: 'start', taskId: 'revoked-task' },
      }),
    ).resolves.toMatchObject({ status: 'rejected', reason: 'authorization_changed' });
  });

  it('purges protected cache and dependent mutations atomically after revocation', async () => {
    const calls: string[] = [];
    await purgeRevokedSessionData({
      transaction: async (work) => {
        calls.push('transaction:start');
        await work();
        calls.push('transaction:commit');
      },
      clearProtectedStores: async () => void calls.push('protected:cleared'),
      clearDependentOutbox: async () => void calls.push('outbox:cleared'),
    });
    expect(calls).toEqual([
      'transaction:start',
      'protected:cleared',
      'outbox:cleared',
      'transaction:commit',
    ]);

    const purge = vi.fn(async () => undefined);
    const unlock = vi.fn();
    vi.stubGlobal('sessionStorage', { removeItem: vi.fn() });
    await expect(
      revalidateProtectedSession({
        lock: vi.fn(),
        validate: vi.fn(async () => ({ valid: false as const, reason: 'revoked' as const })),
        purge,
        unlock,
      }),
    ).resolves.toEqual({ status: 'revoked', retryable: false });
    expect(purge).toHaveBeenCalledOnce();
    expect(unlock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
