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
