import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, planEnhancedSchemaMigration } from '../../src/db/schema.js';
import { supportedLocalSchema } from '../../src/db/sync-cursor.js';

describe('urgency and personal-stack encrypted schema migration', () => {
  it('reconciles the existing v9 database and advances exactly once', () => {
    expect(currentSchemaVersion).toBe(10);
    expect(supportedLocalSchema(10)).toBe(true);
    expect(supportedLocalSchema(9)).toBe(false);
    expect(planEnhancedSchemaMigration(9)).toMatchObject({
      from: 9,
      to: 10,
      preserveOutbox: true,
    });
  });

  it('preserves durable local state while adding encrypted feature stores', () => {
    const plan = planEnhancedSchemaMigration(9) as ReturnType<
      typeof planEnhancedSchemaMigration
    > & {
      preservedStores: readonly string[];
    };

    expect(plan.preservedStores).toEqual(
      expect.arrayContaining(['settings', 'cryptoKeys', 'outbox', 'secureConflicts']),
    );
    expect(plan.storesToAdd).toEqual(
      expect.arrayContaining([
        'secureStackScopes',
        'secureStackMemberships',
        'secureStackOperations',
        'secureStackOperationChunks',
        'secureStackSnapshots',
        'secureStackConflicts',
      ]),
    );
  });

  it('is idempotent at v10 and still rejects future schemas', () => {
    expect(planEnhancedSchemaMigration(10)).toMatchObject({
      from: 10,
      to: 10,
      storesToAdd: [],
    });
    expect(() => planEnhancedSchemaMigration(11)).toThrow('newer');
  });
});
