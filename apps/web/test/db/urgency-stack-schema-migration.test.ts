import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, planEnhancedSchemaMigration } from '../../src/db/schema.js';
import { supportedLocalSchema } from '../../src/db/sync-cursor.js';

describe('urgency and personal-stack encrypted schema migration', () => {
  it('reconciles the existing v9 database through the v16 Finance schema', () => {
    expect(currentSchemaVersion).toBe(16);
    expect(supportedLocalSchema(16)).toBe(true);
    expect(supportedLocalSchema(10)).toBe(false);
    expect(planEnhancedSchemaMigration(9)).toMatchObject({
      from: 9,
      to: 16,
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

  it('is idempotent at v16 and still rejects future schemas', () => {
    expect(planEnhancedSchemaMigration(16)).toMatchObject({
      from: 16,
      to: 16,
      storesToAdd: [],
      storesToDelete: [],
    });
    expect(() => planEnhancedSchemaMigration(17)).toThrow('newer');
  });
});
