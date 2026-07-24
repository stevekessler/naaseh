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
      ]),
    );
    expect(planEnhancedSchemaMigration(6)).toMatchObject({ from: 6, to: 7, preserveOutbox: true });
  });

  it('is idempotent and blocks unsupported future schemas', () => {
    expect(planEnhancedSchemaMigration(7)).toEqual({
      from: 7,
      to: 7,
      preserveOutbox: true,
      storesToAdd: [],
    });
    expect(() => planEnhancedSchemaMigration(8)).toThrow('newer');
  });
});
