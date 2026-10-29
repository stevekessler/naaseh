import { describe, expect, it } from 'vitest';
import { nextRetryDelay } from '@naaseh/domain';
import {
  buildBacklogSnapshot,
  groupSequentialMutations,
  mergeCursor,
} from '../../src/db/outbox.js';
import { supportedLocalSchema } from '../../src/db/sync-cursor.js';
import { currentSchemaVersion } from '../../src/db/schema.js';
import { assertStorageCapacity } from '../../src/db/storage-health.js';
import {
  shouldBootstrapListSnapshot,
  shouldBootstrapOrganizationSnapshot,
  shouldBootstrapTaskSnapshot,
  shouldRefreshTaskSnapshot,
  cursorAdvanced,
} from '../../src/sync/sync-engine.js';
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
  it('detects whether a full feed replay has another page', () => {
    expect(cursorAdvanced({ public: 5, owner: 2 }, { public: 5, owner: 3 })).toBe(true);
    expect(cursorAdvanced({ public: 5, owner: 2 }, { public: 5, owner: 2 })).toBe(false);
  });
  it('recognizes only the current encrypted database schema', () => {
    expect(supportedLocalSchema(currentSchemaVersion)).toBe(true);
    expect(supportedLocalSchema(currentSchemaVersion - 1)).toBe(false);
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
  it('recovers an empty task snapshot even with previously bootstrapped pending edits', () => {
    expect(shouldBootstrapTaskSnapshot(0, 0, false)).toBe(true);
    expect(shouldBootstrapTaskSnapshot(1, 0, false)).toBe(false);
    expect(shouldBootstrapTaskSnapshot(0, 1, false)).toBe(true);
    expect(shouldBootstrapTaskSnapshot(0, 0, true)).toBe(false);
    expect(shouldBootstrapTaskSnapshot(0, 1, true)).toBe(true);
  });
  it('refreshes organization options after the cache interval', () => {
    const now = Date.parse('2026-09-22T12:01:00.000Z');
    expect(shouldBootstrapOrganizationSnapshot(undefined, now)).toBe(true);
    expect(shouldBootstrapOrganizationSnapshot('true', now)).toBe(true);
    expect(shouldBootstrapOrganizationSnapshot('2026-09-22T12:00:30.000Z', now)).toBe(false);
    expect(shouldBootstrapOrganizationSnapshot('2026-09-22T12:00:00.000Z', now)).toBe(true);
  });
  it('refreshes list snapshots and invalidates the legacy permanent marker', () => {
    const now = Date.parse('2026-10-15T01:00:00.000Z');
    expect(shouldBootstrapListSnapshot(undefined, now)).toBe(true);
    expect(shouldBootstrapListSnapshot('true', now)).toBe(true);
    expect(shouldBootstrapListSnapshot('2026-10-15T00:59:30.000Z', now)).toBe(false);
    expect(shouldBootstrapListSnapshot('2026-10-15T00:59:00.000Z', now)).toBe(true);
  });
  it('refreshes task snapshots so a device with a bad cursor still receives server changes', () => {
    const now = Date.parse('2026-10-21T16:01:00.000Z');
    expect(shouldRefreshTaskSnapshot(undefined, now)).toBe(true);
    expect(shouldRefreshTaskSnapshot('true', now)).toBe(true);
    expect(shouldRefreshTaskSnapshot('2026-10-21T16:00:30.000Z', now)).toBe(false);
    expect(shouldRefreshTaskSnapshot('2026-10-21T16:00:00.000Z', now)).toBe(true);
  });
});
