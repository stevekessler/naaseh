import { describe, expect, it } from 'vitest';
import { enhancedEncryptedStores, planEnhancedSchemaMigration } from '../../src/db/schema.js';

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
      ]),
    );
    expect(planEnhancedSchemaMigration(6)).toMatchObject({ from: 6, to: 10, preserveOutbox: true });
  });

  it('is idempotent and blocks unsupported future schemas', () => {
    expect(planEnhancedSchemaMigration(10)).toEqual({
      from: 10,
      to: 10,
      preserveOutbox: true,
      preservedStores: ['settings', 'cryptoKeys', 'outbox', 'secureConflicts'],
      storesToAdd: [],
    });
    expect(() => planEnhancedSchemaMigration(11)).toThrow('newer');
  });
});
