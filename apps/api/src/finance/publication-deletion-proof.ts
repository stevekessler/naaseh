import { z } from 'zod';
import { ulidSchema } from '@naaseh/domain';
import { FinanceUnitOfWork, financeLocatorKey } from './unit-of-work.js';
import { loadFinancePublicationManifest } from './publication-journal-reader.js';
import { isFinanceScopePartition } from './publication-change-journal.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
export const financeCanonicalAbsenceKeys = (
  collection: 'accounts' | 'transactions',
  id: string,
  scopePK: string,
) =>
  [id, createHash('sha256').update(id).digest('hex')].map((value) => ({
    PK: scopePK,
    SK: `ROW#${collection}#${value}`,
  }));

export const financePublicationDeletionKey = (id: string) => ({
  PK: `FINANCE#PUBLICATION_DELETION#${id}`,
  SK: 'CURRENT',
});
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const financePublicationAccountDeletionKey = (id: string) => ({
  PK: `FINANCE#PUBLICATION_ACCOUNT_DELETION#${id}`,
  SK: 'CURRENT',
});
const commonSchema = z
  .object({
    PK: z.string(),
    SK: z.literal('CURRENT'),
    publicationId: z.string().regex(/^[a-f0-9]{64}$/),
    scopePK: z.string().refine(isFinanceScopePartition),
    accountIds: z.array(ulidSchema).min(1).max(100),
    beforeVersion: revision,
    expiresAt: revision.optional(),
  })
  .strict();
const schema = z.union([
  commonSchema
    .extend({ format: z.literal('finance-publication-deletion-v1'), transactionId: ulidSchema })
    .strict(),
  commonSchema
    .extend({ format: z.literal('finance-publication-account-deletion-v1'), accountId: ulidSchema })
    .strict(),
]);
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** Point-read proof only. The eventual remover must commit these conditioned reads with its writes. */
async function loadDeletedSource(
  id: string,
  work: FinanceUnitOfWork,
  collection: 'accounts' | 'transactions',
) {
  if (!ulidSchema.safeParse(id).success) return fail('Finance deletion identity is invalid.');
  const key =
      collection === 'accounts'
        ? financePublicationAccountDeletionKey(id)
        : financePublicationDeletionKey(id),
    saved = await work.get(key);
  if (!saved) return undefined;
  const parsed = schema.safeParse(saved);
  if (
    !parsed.success ||
    parsed.data.PK !== key.PK ||
    (collection === 'accounts'
      ? !('accountId' in parsed.data) || parsed.data.accountId !== id
      : !('transactionId' in parsed.data) || parsed.data.transactionId !== id)
  )
    return fail('Finance deletion proof format or identity is invalid.');
  const proof = parsed.data;
  // Both negative reads are necessary: legacy rows may precede locator enrollment.
  if (await work.get(financeLocatorKey(collection, id))) return undefined;
  for (const key of financeCanonicalAbsenceKeys(collection, id, proof.scopePK))
    if (await work.get(key)) return undefined;
  const { manifest } = await loadFinancePublicationManifest(proof.publicationId, (key) =>
    work.get(key),
  );
  const changes = manifest.changes.filter(
    (change) => change.collection === collection && change.sourceId === id,
  );
  const change = changes.find((change) => change.scopePK === proof.scopePK);
  const transition = manifest.scopes.find((scope) => scope.PK === proof.scopePK);
  if (
    !change ||
    !change.removed ||
    change.afterVersion !== undefined ||
    change.beforeVersion !== proof.beforeVersion ||
    !isDeepStrictEqual(change.accountIds, proof.accountIds) ||
    changes.some((change) => !change.removed) ||
    !transition
  )
    return fail('Finance deletion proof does not match its canonical manifest.');
  const journal = await work.get({
    PK: proof.scopePK,
    SK: `PUBLICATION_CHANGE#${String(transition.afterRevision).padStart(16, '0')}`,
  });
  const meta = await work.get({ PK: proof.scopePK, SK: 'META' });
  if (
    journal?.format !== manifest.format ||
    journal.publicationId !== proof.publicationId ||
    journal.beforeRevision !== transition.beforeRevision ||
    journal.afterRevision !== transition.afterRevision ||
    !Number.isSafeInteger(meta?.revision) ||
    Number(meta?.revision) < transition.afterRevision
  )
    return fail('Finance deletion journal or current revision is invalid.');
  return { ...proof, revision: transition.afterRevision };
}

export async function loadFinanceDeletedTransaction(id: string, work: FinanceUnitOfWork) {
  const proof = await loadDeletedSource(id, work, 'transactions');
  return proof && { ...proof, transactionId: id };
}
export async function loadFinanceDeletedAccount(id: string, work: FinanceUnitOfWork) {
  const proof = await loadDeletedSource(id, work, 'accounts');
  return proof && { ...proof, accountId: id };
}
