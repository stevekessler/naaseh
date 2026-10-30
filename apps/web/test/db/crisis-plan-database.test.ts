import { describe, expect, it } from 'vitest';
import { crisisPlanBrowserMigration } from '../../src/db/feature-migration-registry.js';
import { currentSchemaVersion, planEnhancedSchemaMigration } from '../../src/db/schema.js';

describe('Crisis Plan Dexie migration through the current schema', () => {
  it('adds owner-bound plan stores and later encrypted finance records', () => {
    expect(planEnhancedSchemaMigration(12)).toMatchObject({
      from: 12,
      to: currentSchemaVersion,
      storesToAdd: [
        'secureCrisisPlans',
        'secureCrisisPlanOutbox',
        'secureCrisisPlanOwnerKeys',
        'secureFinanceRecords',
      ],
    });
    expect(crisisPlanBrowserMigration.ownerBoundStores).toEqual([
      'secureCrisisPlans',
      'secureCrisisPlanOutbox',
      'secureCrisisPlanOwnerKeys',
    ]);
    expect(crisisPlanBrowserMigration.recipientDurableStores).toEqual([]);
    expect(crisisPlanBrowserMigration.indexedPlaintextFields).toEqual([]);
  });
});
