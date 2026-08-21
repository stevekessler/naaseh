import {
  defineFeatureVersion,
  negotiateFeatureVersion,
  type FeatureMigrationCheckpoint,
} from '@naaseh/domain';

export const taskSecurityServerMigration = defineFeatureVersion({
  feature: 'task-security-modernization-server',
  minimumVersion: 1,
  currentVersion: 1,
  migrations: [],
});

export const featureMigrationStatuses = ['pending', 'running', 'ready', 'failed'] as const;
export type FeatureMigrationStatus = (typeof featureMigrationStatuses)[number];

export interface BoundedFeatureMigrationStatus extends FeatureMigrationCheckpoint {
  feature: string;
  status: FeatureMigrationStatus;
}

export function parseFeatureMigrationStatus(value: unknown): BoundedFeatureMigrationStatus {
  if (!value || typeof value !== 'object') throw new Error('Feature migration status is required');
  const candidate = value as Record<string, unknown>;
  const allowedKeys = new Set(['feature', 'version', 'status', 'completedStepIds']);
  if (Object.keys(candidate).some((key) => !allowedKeys.has(key)))
    throw new Error('Feature migration status contains unsupported fields');
  const feature = String(candidate.feature ?? '');
  const version = Number(candidate.version);
  const status = candidate.status;
  const completedStepIds = candidate.completedStepIds;
  if (feature !== taskSecurityServerMigration.feature)
    throw new Error('Unknown feature migration registration');
  if (!featureMigrationStatuses.includes(status as FeatureMigrationStatus))
    throw new Error('Unknown feature migration status');
  if (!Array.isArray(completedStepIds) || !completedStepIds.every((id) => typeof id === 'string'))
    throw new Error('Invalid feature migration checkpoint');
  const negotiation = negotiateFeatureVersion(taskSecurityServerMigration, version);
  if (!negotiation.accepted) throw new Error('Unsupported feature migration version');
  return { feature, version, status: status as FeatureMigrationStatus, completedStepIds };
}

export function assertFeatureMigrationReady(value: unknown) {
  const status = parseFeatureMigrationStatus(value);
  if (status.status !== 'ready' || status.version !== taskSecurityServerMigration.currentVersion)
    throw new Error('Feature migration deployment gate is not ready');
  return status;
}

export async function handler(event: unknown) {
  const status = assertFeatureMigrationReady(event);
  return {
    feature: status.feature,
    version: status.version,
    status: status.status,
    completedStepCount: status.completedStepIds.length,
  };
}
