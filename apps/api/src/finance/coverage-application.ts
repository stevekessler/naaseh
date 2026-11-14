import { isFinanceScopePartition } from './publication-change-journal.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { ulidSchema } from '@naaseh/domain';

/** Last source input included in a verified account, retained across later publications. */
export interface FinanceCoverageApplication {
  version: 1;
  generation: string;
  fingerprint: string;
  dependencyScopes: string[];
  originalSourceAccountIds: string[];
}
export function validFinanceCoverageApplication(
  value: unknown,
): value is FinanceCoverageApplication {
  if (!value || typeof value !== 'object') return false;
  const application = value as FinanceCoverageApplication;
  const sortedUnique = (items: unknown, maximum: number, valid: (key: string) => boolean) =>
    Array.isArray(items) &&
    items.length <= maximum &&
    items.every(
      (item, index) =>
        typeof item === 'string' && valid(item) && (index === 0 || items[index - 1] < item),
    );
  return (
    application.version === 1 &&
    typeof application.generation === 'string' &&
    /^[a-f0-9]{64}$/.test(application.generation) &&
    typeof application.fingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(application.fingerprint) &&
    sortedUnique(application.dependencyScopes, 80, isFinanceScopePartition) &&
    application.dependencyScopes.length > 0 &&
    sortedUnique(
      application.originalSourceAccountIds,
      100,
      (id) => ulidSchema.safeParse(id).success,
    )
  );
}
export function validFinanceCoverageCounts(
  value: unknown,
  kind: 'scope' | 'account',
  maxCount = 1_000_000,
): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  return (
    entries.length <= (kind === 'scope' ? 80 : 100) &&
    entries.every(
      ([key, count]) =>
        (kind === 'scope' ? isFinanceScopePartition(key) : ulidSchema.safeParse(key).success) &&
        Number.isSafeInteger(count) &&
        count > 0 &&
        count <= maxCount,
    )
  );
}
export function addFinanceCoverageUses(counts: Record<string, number>, keys: string[]) {
  for (const key of new Set(keys)) {
    const count = (counts[key] ?? 0) + 1;
    if (!Number.isSafeInteger(count) || count > 1_000_000)
      throw new FinanceExperienceFailure('invariant', 'Finance coverage use count is invalid.');
    counts[key] = count;
  }
}
