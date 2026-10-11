import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, planEnhancedSchemaMigration } from '../../src/db/schema.js';
import { supportedLocalSchema } from '../../src/db/sync-cursor.js';

describe('urgency and personal-stack encrypted schema migration', () => {
  it('reconciles the existing v9 database through the v14 integration cleanup schema', () => {
    expect(currentSchemaVersion).toBe(14);
    expect(supportedLocalSchema(14)).toBe(true);
    expect(supportedLocalSchema(10)).toBe(false);
    expect(planEnhancedSchemaMigration(9)).toMatchObject({
      from: 9,
      to: 14,
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

  it('is idempotent at v14 and still rejects future schemas', () => {
    expect(planEnhancedSchemaMigration(14)).toMatchObject({
      from: 14,
      to: 14,
      storesToAdd: [],
      storesToDelete: [],
    });
    expect(() => planEnhancedSchemaMigration(15)).toThrow('newer');
  });
});
