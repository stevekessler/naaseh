import { describe, expect, it } from 'vitest';
import { planEnhancedSchemaMigration } from '../../src/db/schema.js';

describe('Dexie v7 to v8 archive/project migration', () => {
  it('preserves the outbox while adding only encrypted feature stores to the plan', () => {
    const plan = planEnhancedSchemaMigration(7);
    expect(plan).toMatchObject({ from: 7, to: 8, preserveOutbox: true });
    expect(plan.storesToAdd).toEqual(
      expect.arrayContaining(['secureProjects', 'secureCompletionEvents', 'secureDeletionJobs']),
    );
  });
});
