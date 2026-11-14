import { FinanceUnitOfWork, loadTargetedFinanceEntity } from './unit-of-work.js';
import { createHash } from 'node:crypto';
import { ulidSchema } from '@naaseh/domain';
import { loadFinancePublicationManifest } from './publication-journal-reader.js';
import {
  projectionDependencyKey,
  projectionDependencyFormat,
} from './projection-dependency-directory.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { isFinanceAccountRetired } from './account-retirement-marker.js';
import { assertCurrentFinanceAccountBirth } from './account-birth-proof.js';

const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** A journal-proven new identity can start before creation; existing accounts require trusted coverage. */
export async function initializeFinanceProjectionAccount(
  accountId: string,
  publicationId: string,
  factory: () => FinanceUnitOfWork = () => new FinanceUnitOfWork(),
): Promise<{ initialized: boolean }> {
  if (!ulidSchema.safeParse(accountId).success || !/^[a-f0-9]{64}$/.test(publicationId))
    return fail('Finance account creation identity is invalid.');
  const work = factory();
  const account = await loadTargetedFinanceEntity<{ id: string; version: number }>(
    work,
    'accounts',
    accountId,
  );
  if (!account || account.value.id !== accountId)
    return fail('Finance canonical account is unavailable.');
  const { manifest } = await loadFinancePublicationManifest(publicationId, (key) => work.get(key));
  const change = manifest.changes.find(
    (change) =>
      change.scopePK === account.scopeKey.PK &&
      change.collection === 'accounts' &&
      change.sourceId === accountId &&
      change.accountIds.includes(accountId) &&
      change.beforeVersion === undefined &&
      change.afterVersion === 1,
  );
  const transition = manifest.scopes.find((scope) => scope.PK === account.scopeKey.PK);
  if (
    !change ||
    !transition ||
    transition.afterRevision > account.scopeRevision ||
    !Number.isSafeInteger(account.value.version) ||
    account.value.version < 1 ||
    manifest.changes.some(
      (value) =>
        value.collection === 'accounts' &&
        value.sourceId === accountId &&
        value.beforeVersion !== undefined,
    )
  )
    return fail('Finance account creation evidence cannot initialize a moved or existing account.');
  const journal = await work.get({
    PK: transition.PK,
    SK: `PUBLICATION_CHANGE#${String(transition.afterRevision).padStart(16, '0')}`,
  });
  if (
    journal?.format !== manifest.format ||
    journal.publicationId !== publicationId ||
    journal.beforeRevision !== transition.beforeRevision ||
    journal.afterRevision !== transition.afterRevision
  )
    return fail('Finance account creation journal does not match its manifest.');
  const key = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
  const generation = createHash('sha256')
    .update(JSON.stringify([accountId, publicationId]))
    .digest('hex');
  const marker = await work.get(key);
  await assertCurrentFinanceAccountBirth(
    work,
    accountId,
    publicationId,
    transition.PK,
    isFinanceAccountRetired(marker, accountId),
  );
  if (marker) {
    if (
      marker.creationBootstrapId === publicationId &&
      marker.incrementalCoverageVersion === 1 &&
      marker.coverageGeneration === generation
    )
      return { initialized: false };
    if (!isFinanceAccountRetired(marker, accountId))
      return fail(
        'Finance projection already has existing work; trusted coverage repair required.',
      );
    if (
      marker.scopePK === transition.PK &&
      Number(marker.scopeRevision) >= transition.afterRevision
    )
      return fail('Finance retired account requires a later genuine creation.');
  }
  const cardinality = await work.get({
    PK: `FINANCE#FACT_ACCOUNT#${accountId}`,
    SK: 'CARDINALITY',
  });
  if (!Number.isSafeInteger(cardinality?.facts ?? 0) || (cardinality?.facts ?? 0) !== 0)
    return fail('Finance new-account projection index is not empty.');
  const directoryKey = projectionDependencyKey(transition.PK, accountId);
  const directory = await work.get(directoryKey);
  if (
    directory &&
    (directory.format !== projectionDependencyFormat ||
      directory.accountId !== accountId ||
      directory.dependencyScope !== transition.PK)
  )
    return fail('Finance account creation dependency directory identity conflict.');
  if (!directory)
    await work.put({
      ...directoryKey,
      format: projectionDependencyFormat,
      accountId,
      dependencyScope: transition.PK,
    });
  await work.put({
    ...key,
    state: 'awaiting-coverage',
    coverageVerified: false,
    revision: 1,
    sourceScopeRevision: transition.beforeRevision,
    coverageDependencies: { [transition.PK]: transition.beforeRevision },
    coverageDigest: generation,
    coverageGeneration: generation,
    coverageDependencyUseCounts: {},
    coverageOriginalSourceUseCounts: {},
    coverageSourceCount: 0,
    originalSourceAccountIds: [],
    sourceAccountProofVersion: 1,
    coverageDependencyRegistryVersion: 1,
    sourceDependencyIndexVersion: 1,
    incrementalCoverageVersion: 1,
    accountIndexOrderVersion: 1,
    creationBootstrapId: publicationId,
  });
  return work.commit({
    key: { ...key, SK: `PROJECTION_BOOTSTRAP_RECEIPT#${publicationId}` },
    fingerprint: generation,
    result: { initialized: true },
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
  });
}
