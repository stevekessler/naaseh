import { describe, expect, it } from 'vitest';
import { createTask, createUlid, type Mutation } from '@naaseh/domain';
import {
  advanceVectorCursor,
  applyTaskMutation,
  mergeNonOverlapping,
  nextFeedSequence,
  stableReplayResult,
} from '../../src/sync/sync-service.js';
const mutation = (overrides: Partial<Mutation> = {}): Mutation => ({
  id: createUlid(),
  entityId: 'task',
  entityType: 'task',
  operation: 'update',
  baseVersion: 1,
  payload: { label: 'y' },
  createdAt: new Date().toISOString(),
  attempts: 0,
  ...overrides,
});
describe('server synchronization rules', () => {
  it('returns stable conflicts for stale base versions', () => {
    const task = createTask({ label: 'x' }, 'u');
    expect(applyTaskMutation(task, mutation({ entityId: task.id, baseVersion: 0 })).status).toBe(
      'conflict',
    );
  });
  it('does not move vector cursors backward and increments feed sequences exactly once', () => {
    expect(advanceVectorCursor({ PUBLIC: 9 }, 'PUBLIC', 4)).toEqual({ PUBLIC: 9 });
    expect(nextFeedSequence(9)).toBe(10);
  });
  it('returns the prior stable result for idempotent replay', () => {
    const item = mutation();
    expect(
      stableReplayResult({ mutationId: item.id, status: 'applied', version: 2 }, item),
    ).toEqual({ mutationId: item.id, status: 'duplicate', version: 2 });
  });
  it('merges non-overlapping fields but rejects same-field changes across generated cases', () => {
    for (let index = 0; index < 50; index += 1) {
      const base = createTask({ label: `base-${index}`, memo: 'old' }, 'u');
      const remote = { ...base, memo: 'remote', version: 2 };
      expect(mergeNonOverlapping(base, { label: 'local' }, remote)?.label).toBe('local');
      expect(mergeNonOverlapping(base, { memo: 'local' }, remote)).toBeUndefined();
    }
  });
});
