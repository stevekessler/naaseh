import { z } from 'zod';
import { isFinanceScopePartition } from './publication-change-journal.js';
import type { FinancePublicationManifest } from './publication-journal-reader.js';
import { FinanceExperienceFailure } from './telemetry.js';
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const financeAccountRelocationSchema = z
  .object({
    publicationId: z.string().regex(/^[a-f0-9]{64}$/),
    from: z.string().refine(isFinanceScopePartition),
    to: z.string().refine(isFinanceScopePartition),
    beforeVersion: revision,
    afterVersion: revision,
    fromAfterRevision: revision,
    toBeforeRevision: revision,
    toAfterRevision: revision,
  })
  .strict();
export type FinanceAccountRelocation = z.infer<typeof financeAccountRelocationSchema>;
/** Only an atomic old-row removal plus new-row creation proves an account move. */
export function financeAccountRelocations(
  manifest: FinancePublicationManifest,
  accountId: string,
): FinanceAccountRelocation[] {
  const changes = manifest.changes.filter(
    (change) => change.collection === 'accounts' && change.sourceId === accountId,
  );
  const old = changes.find((change) => change.removed),
    next = changes.find(
      (change) =>
        !change.removed && change.beforeVersion === undefined && change.afterVersion !== undefined,
    );
  if (!old || !next) return [];
  const from = manifest.scopes.find((scope) => scope.PK === old.scopePK),
    to = manifest.scopes.find((scope) => scope.PK === next.scopePK);
  if (
    changes.length !== 2 ||
    old.scopePK === next.scopePK ||
    old.beforeVersion === undefined ||
    old.afterVersion !== undefined ||
    next.afterVersion !== old.beforeVersion + 1 ||
    !from ||
    !to
  )
    throw new FinanceExperienceFailure(
      'invariant',
      'Finance relocation version or atomic move proof is invalid.',
    );
  return [
    {
      publicationId: manifest.id,
      from: old.scopePK,
      to: next.scopePK,
      beforeVersion: old.beforeVersion,
      afterVersion: next.afterVersion,
      fromAfterRevision: from.afterRevision,
      toBeforeRevision: to.beforeRevision,
      toAfterRevision: to.afterRevision,
    },
  ];
}
