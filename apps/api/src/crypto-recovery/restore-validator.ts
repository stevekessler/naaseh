import type { Task } from '@naaseh/domain';

export const MAX_RPO_SECONDS = 5 * 60;
export const MAX_RTO_SECONDS = 4 * 60 * 60;

export type RestoreExpectations = {
  tasks: number;
  privateTasks: number;
};

export type RestoreValidationContext = {
  recoveryPointAt: string;
  startedAt: string;
  completedAt: string;
  authorizationPassed: boolean;
  requiredKeyVersions: string[];
  restoredKeyVersions: string[];
  decryptedKeyVersions: string[];
  expectedArtifactHashes?: Record<string, string>;
  restoredArtifactHashes?: Record<string, string>;
};

export function validateRestore(
  expected: RestoreExpectations,
  tasks: Task[],
  context?: RestoreValidationContext,
) {
  const actual = {
    tasks: tasks.length,
    privateTasks: tasks.filter((task) => task.visibility === 'private').length,
  };
  const discrepancies: string[] = [];
  if (actual.tasks !== expected.tasks)
    discrepancies.push(`Expected ${expected.tasks} tasks; restored ${actual.tasks}.`);
  if (actual.privateTasks !== expected.privateTasks)
    discrepancies.push(
      `Expected ${expected.privateTasks} private tasks; restored ${actual.privateTasks}.`,
    );

  if (!context) return { passed: discrepancies.length === 0, actual, discrepancies };

  const rpoSeconds = secondsBetween(context.recoveryPointAt, context.startedAt);
  const rtoSeconds = secondsBetween(context.startedAt, context.completedAt);
  const restored = new Set(context.restoredKeyVersions);
  const decrypted = new Set(context.decryptedKeyVersions);
  const missingKeyVersions = context.requiredKeyVersions.filter(
    (version) => !restored.has(version),
  );
  const undecryptableKeyVersions = context.requiredKeyVersions.filter(
    (version) => !decrypted.has(version),
  );
  const hashMismatches = Object.entries(context.expectedArtifactHashes ?? {})
    .filter(([name, hash]) => context.restoredArtifactHashes?.[name] !== hash)
    .map(([name]) => name)
    .sort();

  if (!Number.isFinite(rpoSeconds) || rpoSeconds < 0 || rpoSeconds > MAX_RPO_SECONDS)
    discrepancies.push(`RPO ${rpoSeconds}s exceeds the ${MAX_RPO_SECONDS}s target.`);
  if (!Number.isFinite(rtoSeconds) || rtoSeconds < 0 || rtoSeconds > MAX_RTO_SECONDS)
    discrepancies.push(`RTO ${rtoSeconds}s exceeds the ${MAX_RTO_SECONDS}s target.`);
  if (!context.authorizationPassed) discrepancies.push('Authorization boundary validation failed.');
  if (missingKeyVersions.length)
    discrepancies.push(`Missing key versions: ${missingKeyVersions.join(', ')}.`);
  if (undecryptableKeyVersions.length)
    discrepancies.push(`Undecryptable key versions: ${undecryptableKeyVersions.join(', ')}.`);
  if (hashMismatches.length)
    discrepancies.push(`Artifact hash mismatches: ${hashMismatches.join(', ')}.`);

  return {
    passed: discrepancies.length === 0,
    actual,
    rpoSeconds,
    rtoSeconds,
    missingKeyVersions,
    undecryptableKeyVersions,
    hashMismatches,
    discrepancies,
  };
}

function secondsBetween(earlier: string, later: string): number {
  const difference = Date.parse(later) - Date.parse(earlier);
  if (!Number.isFinite(difference)) return Number.NaN;
  return difference / 1_000;
}
