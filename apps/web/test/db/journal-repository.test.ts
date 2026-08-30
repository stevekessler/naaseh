import { describe, expect, it } from 'vitest';
import { currentSchemaVersion, planEnhancedSchemaMigration } from '../../src/db/schema.js';
import { journalBrowserMigration } from '../../src/db/feature-migration-registry.js';
import {
  assertCiphertextOnlyJournalRecord,
  journalDraftSyncState,
} from '../../src/db/journal-repository.js';

describe('Dexie journal migration', () => {
  it('retains encrypted journal stores through schema version 13', () => {
    expect(currentSchemaVersion).toBe(13);
    expect(planEnhancedSchemaMigration(11).storesToAdd).toEqual([
      'secureJournalEntries',
      'secureJournalProfiles',
      'secureJournalKeyEnvelopes',
      'secureJournalConflicts',
      'secureJournalOutbox',
      'secureCrisisPlans',
      'secureCrisisPlanOutbox',
      'secureCrisisPlanOwnerKeys',
    ]);
    expect(journalBrowserMigration.currentVersion).toBe(12);
  });

  it('indexes every journal record by owner for purge without plaintext indexes', () => {
    expect(journalBrowserMigration.ownerBoundStores).toEqual([
      'secureJournalEntries',
      'secureJournalProfiles',
      'secureJournalKeyEnvelopes',
      'secureJournalConflicts',
      'secureJournalOutbox',
    ]);
    expect(journalBrowserMigration.indexedPlaintextFields).toEqual([]);
  });

  it('preserves pending and oversized encrypted drafts while rejecting plaintext fields', () => {
    expect(journalDraftSyncState(100)).toEqual({
      status: 'pending',
      preserved: true,
      pending: true,
    });
    expect(journalDraftSyncState(307_201)).toEqual({
      status: 'oversized-local-draft',
      preserved: true,
      pending: true,
    });
    expect(() =>
      assertCiphertextOnlyJournalRecord({ ownerId: 'owner', projection: { ciphertext: 'opaque' } }),
    ).not.toThrow();
    expect(() =>
      assertCiphertextOnlyJournalRecord({ ownerId: 'owner', date: '2026-08-29' }),
    ).toThrow('plaintext');
  });
});
