import { describe, expect, it } from 'vitest';
import { nextRetryDelay } from '@naaseh/domain';
import {
  buildBacklogSnapshot,
  groupSequentialMutations,
  mergeCursor,
} from '../../src/db/outbox.js';
import { supportedLocalSchema } from '../../src/db/sync-cursor.js';
import { assertStorageCapacity } from '../../src/db/storage-health.js';
import { shouldBootstrapTaskSnapshot } from '../../src/sync/sync-engine.js';
describe('durable local outbox rules', () => {
  it('keeps each entity sequential while allowing independent entity queues', () => {
    const grouped = groupSequentialMutations([
      { entityId: 'a', createdAt: '2026-01-02' },
      { entityId: 'b', createdAt: '2026-01-01' },
      { entityId: 'a', createdAt: '2026-01-01' },
    ]);
    expect(
      grouped.map((group) => group.map((item) => `${item.entityId}:${item.createdAt}`)),
    ).toEqual([['b:2026-01-01'], ['a:2026-01-01', 'a:2026-01-02']]);
  });
  it('advances cursor entries monotonically', () =>
    expect(mergeCursor({ public: 5, owner: 2 }, { public: 3, owner: 7 })).toEqual({
      public: 5,
      owner: 7,
    }));
  it('recognizes only the current encrypted database schema', () => {
    expect(supportedLocalSchema(10)).toBe(true);
    expect(supportedLocalSchema(9)).toBe(false);
  });
  it('blocks saves before quota exhaustion and uses bounded jittered retries', () => {
    expect(() => assertStorageCapacity(96, 100, 1)).toThrow('cannot be saved safely');
    expect(nextRetryDelay(0, () => 0)).toBe(250);
    expect(nextRetryDelay(20, () => 1)).toBeLessThanOrEqual(30000);
  });
  it('reports content-free backlog depth and oldest durable age', () => {
    expect(
      buildBacklogSnapshot(3, '2026-07-23T11:58:00.000Z', Date.parse('2026-07-23T12:00:00.000Z')),
    ).toEqual({ depth: 3, oldestAgeSeconds: 120 });
    expect(buildBacklogSnapshot(0, undefined)).toBeUndefined();
  });
  it('bootstraps an uninitialized empty task snapshot exactly once', () => {
    expect(shouldBootstrapTaskSnapshot(0, 0, false)).toBe(true);
    expect(shouldBootstrapTaskSnapshot(1, 0, false)).toBe(false);
    expect(shouldBootstrapTaskSnapshot(0, 1, false)).toBe(false);
    expect(shouldBootstrapTaskSnapshot(0, 0, true)).toBe(false);
  });
});
