export interface ArchiveProjectMigrationConfig {
  mode: 'off' | 'dual-write' | 'backfill' | 'verify' | 'complete';
  pageSize: number;
}

export function archiveProjectMigrationConfig(
  source: Record<string, string | undefined>,
): ArchiveProjectMigrationConfig {
  const mode = source.NAASEH_ARCHIVE_PROJECT_MIGRATION_MODE ?? 'off';
  if (!['off', 'dual-write', 'backfill', 'verify', 'complete'].includes(mode))
    throw new Error('Invalid archive/project migration mode.');
  const pageSize = Number(source.NAASEH_ARCHIVE_PROJECT_MIGRATION_PAGE_SIZE ?? 50);
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new Error('Migration page size must be between 1 and 100.');
  return { mode: mode as ArchiveProjectMigrationConfig['mode'], pageSize };
}
