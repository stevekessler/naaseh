import type { FinanceUnitOfWork } from './unit-of-work.js';
import {
  loadFinanceDeletedAccount,
  type loadFinanceDeletedTransaction,
} from './publication-deletion-proof.js';
import { loadFinancePublicationManifest } from './publication-journal-reader.js';
import { FinanceExperienceFailure } from './telemetry.js';
/** Source startup already validated creation in this generation; recheck its immutable evidence and both deletions. */
export async function assertRetiringUnappliedCreation(
  work: FinanceUnitOfWork,
  input: {
    transactionId: string;
    accountId: string;
    creationPublicationId: string;
    retirementPublicationId: string;
    sourceDeletion: NonNullable<Awaited<ReturnType<typeof loadFinanceDeletedTransaction>>>;
  },
) {
  const fail = (): never => {
    throw new FinanceExperienceFailure(
      'invariant',
      'Finance retiring unapplied source creation proof is invalid.',
    );
  };
  const account = await loadFinanceDeletedAccount(input.accountId, work);
  if (
    !account ||
    account.publicationId !== input.retirementPublicationId ||
    !account.accountIds.includes(input.accountId)
  )
    return fail();
  const { manifest } = await loadFinancePublicationManifest(input.creationPublicationId, (key) =>
    work.get(key),
  );
  const creation = manifest.changes.find(
    (change) =>
      change.collection === 'transactions' &&
      change.sourceId === input.transactionId &&
      change.beforeVersion === undefined &&
      change.afterVersion !== undefined &&
      change.afterVersion <= input.sourceDeletion.beforeVersion &&
      change.accountIds.includes(input.accountId) &&
      !change.removed,
  );
  const transition = manifest.scopes.find((scope) => scope.PK === creation?.scopePK);
  if (
    !creation ||
    !transition ||
    manifest.changes.some(
      (change) =>
        change.collection === 'transactions' &&
        change.sourceId === input.transactionId &&
        change.removed,
    ) ||
    (transition.PK === input.sourceDeletion.scopePK &&
      transition.afterRevision >= input.sourceDeletion.revision)
  )
    return fail();
  const journal = await work.get({
    PK: transition.PK,
    SK: `PUBLICATION_CHANGE#${String(transition.afterRevision).padStart(16, '0')}`,
  });
  const meta = await work.get({ PK: transition.PK, SK: 'META' });
  if (
    journal?.format !== manifest.format ||
    journal.publicationId !== manifest.id ||
    journal.beforeRevision !== transition.beforeRevision ||
    journal.afterRevision !== transition.afterRevision ||
    !Number.isSafeInteger(meta?.revision) ||
    Number(meta?.revision) < transition.afterRevision
  )
    return fail();
}
