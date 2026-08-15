export interface FeatureMigrationStep {
  id: string;
  from: number;
  to: number;
}

export interface FeatureVersionRegistration {
  feature: string;
  minimumVersion: number;
  currentVersion: number;
  migrations: readonly FeatureMigrationStep[];
}

export interface FeatureMigrationCheckpoint {
  version: number;
  completedStepIds: string[];
}

function assertVersion(value: number, name: string) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`);
}

export function defineFeatureVersion(
  registration: FeatureVersionRegistration,
): FeatureVersionRegistration {
  if (!registration.feature.trim()) throw new Error('Feature name is required');
  assertVersion(registration.minimumVersion, 'minimumVersion');
  assertVersion(registration.currentVersion, 'currentVersion');
  if (registration.minimumVersion > registration.currentVersion)
    throw new Error('minimumVersion cannot exceed currentVersion');

  let expected = registration.minimumVersion;
  const ids = new Set<string>();
  for (const step of registration.migrations) {
    if (!step.id.trim() || ids.has(step.id)) throw new Error('Migration step IDs must be unique');
    if (step.from !== expected || step.to !== step.from + 1)
      throw new Error('Feature migrations must form a contiguous, ordered path');
    ids.add(step.id);
    expected = step.to;
  }
  if (expected !== registration.currentVersion)
    throw new Error('Feature migrations must form a contiguous path to currentVersion');

  return Object.freeze({
    ...registration,
    migrations: Object.freeze(registration.migrations.map((step) => Object.freeze({ ...step }))),
  });
}

export type FeatureVersionNegotiation =
  | {
      accepted: true;
      requestedVersion: number;
      currentVersion: number;
      migrationRequired: boolean;
    }
  | {
      accepted: false;
      requestedVersion: number;
      currentVersion: number;
      reason: 'client_version_unsupported' | 'client_version_newer';
    };

export function negotiateFeatureVersion(
  registration: FeatureVersionRegistration,
  requestedVersion: number,
): FeatureVersionNegotiation {
  if (!Number.isSafeInteger(requestedVersion) || requestedVersion < registration.minimumVersion)
    return {
      accepted: false,
      requestedVersion,
      currentVersion: registration.currentVersion,
      reason: 'client_version_unsupported',
    };
  if (requestedVersion > registration.currentVersion)
    return {
      accepted: false,
      requestedVersion,
      currentVersion: registration.currentVersion,
      reason: 'client_version_newer',
    };
  return {
    accepted: true,
    requestedVersion,
    currentVersion: registration.currentVersion,
    migrationRequired: requestedVersion < registration.currentVersion,
  };
}

export function planFeatureMigrations(
  registration: FeatureVersionRegistration,
  fromVersion: number,
) {
  if (fromVersion < registration.minimumVersion || fromVersion > registration.currentVersion)
    throw new Error('Feature version is outside the supported migration range');
  return registration.migrations.filter((step) => step.from >= fromVersion);
}

export async function runFeatureMigrations(options: {
  registration: FeatureVersionRegistration;
  checkpoint: FeatureMigrationCheckpoint;
  handlers: Record<string, () => Promise<void>>;
  saveCheckpoint: (checkpoint: FeatureMigrationCheckpoint) => Promise<void>;
}) {
  const completed = new Set(options.checkpoint.completedStepIds);
  let version = options.checkpoint.version;
  for (const step of planFeatureMigrations(options.registration, version)) {
    if (completed.has(step.id)) {
      version = Math.max(version, step.to);
      continue;
    }
    const handler = options.handlers[step.id];
    if (!handler) throw new Error(`Missing migration handler: ${step.id}`);
    await handler();
    completed.add(step.id);
    version = step.to;
    await options.saveCheckpoint({ version, completedStepIds: [...completed] });
  }
  return { version, completedStepIds: [...completed] } satisfies FeatureMigrationCheckpoint;
}
