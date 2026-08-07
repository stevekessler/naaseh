export const currentSchemaVersion = 10;

const storeIntroductions = [
  {
    version: 7,
    stores: [
      'secureLists',
      'secureListItems',
      'secureDirectoryItems',
      'secureAttachments',
      'secureJobs',
    ],
  },
  {
    version: 8,
    stores: ['secureProjects', 'secureCompletionEvents', 'secureDeletionJobs'],
  },
  { version: 9, stores: ['secureGoogleSync'] },
  {
    version: 10,
    stores: [
      'secureStackScopes',
      'secureStackMemberships',
      'secureStackOperations',
      'secureStackOperationChunks',
      'secureStackSnapshots',
      'secureStackConflicts',
    ],
  },
] as const;

export const enhancedEncryptedStores = storeIntroductions.flatMap(({ stores }) => stores);
export const preservedEncryptedStores = [
  'settings',
  'cryptoKeys',
  'outbox',
  'secureConflicts',
] as const;

export interface EnhancedSchemaMigrationPlan {
  from: number;
  to: typeof currentSchemaVersion;
  preserveOutbox: true;
  preservedStores: typeof preservedEncryptedStores;
  storesToAdd: readonly string[];
}

export function planEnhancedSchemaMigration(from: number): EnhancedSchemaMigrationPlan {
  if (from > currentSchemaVersion)
    throw new Error('Local schema is newer than this application supports');
  return {
    from,
    to: currentSchemaVersion,
    preserveOutbox: true,
    preservedStores: preservedEncryptedStores,
    storesToAdd: storeIntroductions
      .filter(({ version }) => version > from)
      .flatMap(({ stores }) => [...stores]),
  };
}
export interface Migration {
  version: number;
  migrate: () => Promise<void>;
}
export async function runMigrations(migrations: Migration[], from: number): Promise<number> {
  let version = from;
  for (const migration of migrations
    .filter((item) => item.version > from)
    .sort((a, b) => a.version - b.version)) {
    await migration.migrate();
    version = migration.version;
  }
  return version;
}
