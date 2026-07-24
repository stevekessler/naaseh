import { describe, expect, it, vi } from 'vitest';
import { createTask } from '@naaseh/domain';
import {
  saveTaskMutation,
  type TaskMutationDependencies,
} from '../../src/tasks/task-repository.js';

function dependencies(overrides: Partial<TaskMutationDependencies> = {}): TaskMutationDependencies {
  return {
    prepareChange: vi.fn(async (change) => ({
      expectedSequence: 0,
      change: { ...change, sequence: 1 },
    })),
    commit: vi.fn(async () => undefined),
    findResult: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('task mutation contention recovery', () => {
  it('re-reads feed counters and retries the same logical revision after contention', async () => {
    const task = createTask({ label: 'Contended' }, 'steve');
    const commit = vi
      .fn<TaskMutationDependencies['commit']>()
      .mockRejectedValueOnce(new Error('TransactionCanceledException'))
      .mockResolvedValueOnce(undefined);
    const deps = dependencies({ commit });

    const result = await saveTaskMutation(
      task,
      'steve',
      'mutation-1',
      'create',
      ['label'],
      undefined,
      deps,
      'client-1',
    );

    expect(result.replayed).toBe(false);
    expect(deps.prepareChange).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit.mock.calls[0]?.[1].id).toBe(commit.mock.calls[1]?.[1].id);
    expect(commit.mock.calls[0]?.[1]).toMatchObject({
      sourceClientId: 'client-1',
      syncOutcome: 'applied',
      after: {},
    });
    expect(JSON.stringify(commit.mock.calls[0]?.[1])).not.toContain('Contended');
  });

  it('returns the durable original result when an identical request wins the race', async () => {
    const attempted = createTask({ label: 'Attempted' }, 'steve');
    const original = { ...attempted, label: 'Original stable value' };
    const deps = dependencies({
      commit: vi.fn(async () => {
        throw new Error('TransactionCanceledException');
      }),
      findResult: vi.fn(async () => ({
        mutationId: 'same',
        status: 'applied',
        entityVersion: original.version,
        entity: original,
      })),
    });

    const result = await saveTaskMutation(
      attempted,
      'steve',
      'same',
      'create',
      ['label'],
      undefined,
      deps,
    );

    expect(result).toMatchObject({ task: original, replayed: true });
    expect(deps.commit).toHaveBeenCalledTimes(1);
    expect(deps.findResult).toHaveBeenCalledWith('same', 'steve');
  });
});
