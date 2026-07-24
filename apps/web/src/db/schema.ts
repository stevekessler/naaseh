export const currentSchemaVersion = 7;
export const enhancedEncryptedStores = [
  'secureLists',
  'secureListItems',
  'secureDirectoryItems',
  'secureAttachments',
  'secureJobs',
] as const;

export interface EnhancedSchemaMigrationPlan {
  from: number;
  to: typeof currentSchemaVersion;
  preserveOutbox: true;
  storesToAdd: readonly string[];
}

export function planEnhancedSchemaMigration(from: number): EnhancedSchemaMigrationPlan {
  if (from > currentSchemaVersion)
    throw new Error('Local schema is newer than this application supports');
  return {
    from,
    to: currentSchemaVersion,
    preserveOutbox: true,
    storesToAdd: from < currentSchemaVersion ? [...enhancedEncryptedStores] : [],
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
