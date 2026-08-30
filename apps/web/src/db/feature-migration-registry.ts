import {
  defineFeatureVersion,
  runFeatureMigrations,
  type FeatureMigrationCheckpoint,
} from '@naaseh/domain';

export const taskSecurityBrowserMigration = defineFeatureVersion({
  feature: 'task-security-modernization-browser',
  minimumVersion: 10,
  currentVersion: 11,
  migrations: [{ id: 'initialize-v11-migration-scaffold', from: 10, to: 11 }],
});

export function runTaskSecurityBrowserMigrations(options: {
  checkpoint: FeatureMigrationCheckpoint;
  initializeScaffold: () => Promise<void>;
  saveCheckpoint: (checkpoint: FeatureMigrationCheckpoint) => Promise<void>;
}) {
  return runFeatureMigrations({
    registration: taskSecurityBrowserMigration,
    checkpoint: options.checkpoint,
    handlers: { 'initialize-v11-migration-scaffold': options.initializeScaffold },
    saveCheckpoint: options.saveCheckpoint,
  });
}

const journalOwnerBoundStores = [
  'secureJournalEntries',
  'secureJournalProfiles',
  'secureJournalKeyEnvelopes',
  'secureJournalConflicts',
  'secureJournalOutbox',
] as const;
export const journalBrowserMigration = Object.freeze({
  ...defineFeatureVersion({
    feature: 'private-journal-browser',
    minimumVersion: 11,
    currentVersion: 12,
    migrations: [{ id: 'add-encrypted-journal-stores', from: 11, to: 12 }],
  }),
  ownerBoundStores: journalOwnerBoundStores,
  indexedPlaintextFields: [] as const,
});

export const crisisPlanBrowserMigration = Object.freeze({
  ...defineFeatureVersion({
    feature: 'journal-crisis-plan-browser',
    minimumVersion: 12,
    currentVersion: 13,
    migrations: [{ id: 'add-owner-only-crisis-plan-stores', from: 12, to: 13 }],
  }),
  ownerBoundStores: [
    'secureCrisisPlans',
    'secureCrisisPlanOutbox',
    'secureCrisisPlanOwnerKeys',
  ] as const,
  recipientDurableStores: [] as const,
  indexedPlaintextFields: [] as const,
});
