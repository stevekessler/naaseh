import { describe, expect, it } from 'vitest';
import {
  applyGenericPullBatch,
  deduplicateEntityChanges,
} from '../../apps/web/src/sync/entity-batch.js';

describe('generic enhanced pull batches', () => {
  it('keeps the latest entity version and merges cursor entries monotonically', () => {
    const changes = deduplicateEntityChanges([
      { entityType: 'list', entityId: 'a', version: 1, operation: 'upsert' },
      { entityType: 'list', entityId: 'a', version: 2, operation: 'upsert' },
      { entityType: 'directoryItem', entityId: 'b', version: 1, operation: 'upsert' },
    ]);
    expect(changes.map((item) => `${item.entityId}:${item.version}`)).toEqual(['a:2', 'b:1']);
    expect(
      applyGenericPullBatch({ entities: {}, cursor: { public: 5 } }, changes, {
        public: 3,
        admin: 2,
      }),
    ).toMatchObject({ cursor: { public: 5, admin: 2 } });
  });

  it('applies tombstones without advancing state when validation fails', () => {
    const state = {
      entities: {
        'list:a': { entityType: 'list', entityId: 'a', version: 1, operation: 'upsert' as const },
      },
      cursor: { public: 1 },
    };
    expect(
      applyGenericPullBatch(
        state,
        [{ entityType: 'list', entityId: 'a', version: 2, operation: 'tombstone' }],
        { public: 2 },
      ).entities,
    ).toEqual({});
    expect(() =>
      applyGenericPullBatch(
        state,
        [{ entityType: 'unknown', entityId: 'x', version: 1, operation: 'upsert' }],
        { public: 2 },
      ),
    ).toThrow('Unsupported');
    expect(state.cursor).toEqual({ public: 1 });
  });
});
