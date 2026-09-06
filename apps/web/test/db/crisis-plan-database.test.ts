import { describe, expect, it } from 'vitest';
import { crisisPlanBrowserMigration } from '../../src/db/feature-migration-registry.js';
import { planEnhancedSchemaMigration } from '../../src/db/schema.js';

describe('Crisis Plan Dexie v13 migration', () => {
  it('adds only owner-bound encrypted plan, outbox, and owner-key stores', () => {
    expect(planEnhancedSchemaMigration(12)).toMatchObject({
      from: 12,
      to: 13,
      storesToAdd: ['secureCrisisPlans', 'secureCrisisPlanOutbox', 'secureCrisisPlanOwnerKeys'],
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
