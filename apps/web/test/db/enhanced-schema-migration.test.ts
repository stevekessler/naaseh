import { describe, expect, it } from 'vitest';
import {
  currentSchemaVersion,
  enhancedEncryptedStores,
  planEnhancedSchemaMigration,
} from '../../src/db/schema.js';

describe('enhanced encrypted database migration', () => {
  it('adds every enhanced encrypted store without dropping the outbox', () => {
    expect(enhancedEncryptedStores).toEqual(
      expect.arrayContaining([
        'secureLists',
        'secureListItems',
        'secureDirectoryItems',
        'secureAttachments',
        'secureJobs',
        'secureProjects',
        'secureCompletionEvents',
        'secureDeletionJobs',
        'secureFinanceRecords',
      ]),
    );
    expect(planEnhancedSchemaMigration(6)).toMatchObject({
      from: 6,
      to: currentSchemaVersion,
      preserveOutbox: true,
      storesToDelete: ['secureGoogleSync'],
    });
  });

  it('is idempotent and blocks unsupported future schemas', () => {
    expect(planEnhancedSchemaMigration(currentSchemaVersion)).toEqual({
      from: currentSchemaVersion,
      to: currentSchemaVersion,
      preserveOutbox: true,
      preservedStores: ['settings', 'cryptoKeys', 'outbox', 'secureConflicts'],
      storesToAdd: [],
      storesToDelete: [],
    });
    expect(() => planEnhancedSchemaMigration(currentSchemaVersion + 1)).toThrow('newer');
  });
});
