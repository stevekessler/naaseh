import { assertFinanceSourceCreation } from './publication-creation-proof.js';
import { loadCanonicalFinanceFact } from './canonical-spend-source.js';
import { FinanceUnitOfWork, loadTargetedFinanceEntity } from './unit-of-work.js';
import { FinanceExperienceFailure } from './telemetry.js';
import { financeReadKeys } from './read-repository.js';
import { isDeepStrictEqual } from 'node:util';
import { createHash } from 'node:crypto';
import type { FinanceFact } from './query-contract.js';
import {
  financePublicationFingerprint,
  sameFinancePublicationSource,
} from './source-dependency-index.js';
import {
  validFinanceCoverageApplication,
  validFinanceCoverageCounts,
  addFinanceCoverageUses,
  type FinanceCoverageApplication,
} from './coverage-application.js';

const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};

/** Private consumer building block. Updating counts NEVER certifies account readiness. */
export class FinanceIncrementalCoverageService {
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      resolve?: typeof loadCanonicalFinanceFact;
    } = {},
  ) {}
  async applyPublishedSource(
    transactionId: string,
    options: { creationPublicationId?: string } = {},
  ): Promise<{ applied: boolean }> {
    const factory = this.options.work ?? (() => new FinanceUnitOfWork());
    const canonical = await (this.options.resolve ?? loadCanonicalFinanceFact)(
      transactionId,
      factory,
    );
    const work = factory();
    const accountId = canonical.fact.accountId;
    const account = await loadTargetedFinanceEntity<{ id: string }>(work, 'accounts', accountId);
    if (
      !account ||
      account.value.id !== accountId ||
      canonical.fact.id !== transactionId ||
      canonical.sourceKey.PK !== account.storageKey.PK ||
      canonical.dependencies[account.scopeKey.PK] !== account.scopeRevision
    )
      return fail('Finance canonical source changed or is unavailable.');
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    const marker = await work.get(markerKey);
    const sourceCount = Number(marker?.coverageSourceCount);
    if (
      !marker ||
      !['ready', 'awaiting-coverage'].includes(String(marker.state)) ||
      marker.incrementalCoverageVersion !== 1 ||
      !Number.isSafeInteger(marker.revision) ||
      Number(marker.revision) < 0 ||
      !Number.isSafeInteger(sourceCount) ||
      sourceCount < 0 ||
      sourceCount > 1_000_000 ||
      !validFinanceCoverageCounts(marker.coverageDependencyUseCounts, 'scope', sourceCount) ||
      !validFinanceCoverageCounts(marker.coverageOriginalSourceUseCounts, 'account', sourceCount) ||
      !isDeepStrictEqual(
        marker.originalSourceAccountIds,
        Object.keys(marker.coverageOriginalSourceUseCounts).sort(),
      )
    )
      return fail('Finance incremental coverage baseline is unavailable.');
    const key = { PK: `FINANCE#TRANSACTION#${transactionId}`, SK: 'SPEND_CONTRIBUTION' };
    const row = await work.get(key);
    const publication = row?.data as Record<string, unknown> | undefined;
    const projected = (await work.get(financeReadKeys.fact(transactionId)))?.fact as
      | FinanceFact
      | undefined;
    if (
      !projected ||
      !sameFinancePublicationSource(projected, canonical.fact) ||
      publication?.state !== 'complete' ||
      publication.textPostingVersion !== 2 ||
      publication.dependencyIndexVersion !== 1 ||
      typeof publication.calendarBasis !== 'string' ||
      publication.fingerprint !==
        financePublicationFingerprint(canonical.fact, publication.calendarBasis)
    )
      return fail('Finance source publication is incomplete or no longer canonical.');
    const saved = publication.coverageApplication;
    let previous: FinanceCoverageApplication | undefined;
    if (validFinanceCoverageApplication(saved)) {
      if (saved.generation !== marker.coverageGeneration || sourceCount === 0)
        return fail('Finance coverage application baseline generation does not match.');
      previous = saved;
    } else {
      if (
        saved !== undefined ||
        !options.creationPublicationId ||
        !/^[a-f0-9]{64}$/.test(options.creationPublicationId) ||
        typeof marker.coverageGeneration !== 'string' ||
        !/^[a-f0-9]{64}$/.test(marker.coverageGeneration)
      )
        return fail('Finance coverage baseline requires proven source creation.');
      await assertFinanceSourceCreation(work, {
        publicationId: options.creationPublicationId,
        transactionId,
        accountId,
        scopePK: canonical.sourceKey.PK,
        sourceVersion: Number(canonical.fact.sourceVersion),
        marker,
      });
    }
    const nextSourceCount = sourceCount + (previous ? 0 : 1);
    if (nextSourceCount > 1_000_000) return fail('Finance source coverage count budget exceeded.');
    const next: FinanceCoverageApplication = {
      version: 1,
      generation: marker.coverageGeneration as string,
      fingerprint: publication.fingerprint as string,
      dependencyScopes: Object.keys(canonical.dependencies).sort(),
      originalSourceAccountIds: [...new Set(canonical.fact.originalSourceAccountIds ?? [])].sort(),
    };
    if (!validFinanceCoverageApplication(next))
      return fail('Finance source coverage input is invalid.');
    // These reads are conditioned with the source, marker and contribution in the same transaction.
    for (const [PK, revision] of Object.entries(canonical.dependencies)) {
      if (
        !Number.isSafeInteger(revision) ||
        revision < 0 ||
        (await work.get({ PK, SK: 'META' }))?.revision !== revision
      )
        return fail('Finance canonical source revision changed.');
    }
    if (isDeepStrictEqual(previous, next)) return { applied: false };
    const scopes = { ...marker.coverageDependencyUseCounts };
    const originals = { ...marker.coverageOriginalSourceUseCounts };
    const remove = (counts: Record<string, number>, keys: string[]) => {
      for (const key of keys) {
        if (!Number.isSafeInteger(counts[key]) || counts[key]! < 1)
          return fail('Finance coverage baseline count is inconsistent.');
        if (counts[key] === 1) delete counts[key];
        else counts[key]!--;
      }
    };
    if (previous) {
      remove(scopes, previous.dependencyScopes);
      remove(originals, previous.originalSourceAccountIds);
    }
    addFinanceCoverageUses(scopes, next.dependencyScopes);
    addFinanceCoverageUses(originals, next.originalSourceAccountIds);
    if (
      !validFinanceCoverageCounts(scopes, 'scope', nextSourceCount) ||
      !validFinanceCoverageCounts(originals, 'account', nextSourceCount)
    )
      return fail('Finance incremental coverage count budget exceeded.');
    const appliedPublication: Record<string, unknown> = {
      ...publication,
      coverageApplication: next,
    };
    delete appliedPublication.creationPublicationId;
    delete appliedPublication.creationCoverageGeneration;
    await work.put({ ...row!, data: appliedPublication });
    await work.put({
      ...marker,
      coverageDependencyUseCounts: scopes,
      coverageOriginalSourceUseCounts: originals,
      coverageSourceCount: nextSourceCount,
      originalSourceAccountIds: Object.keys(originals).sort(),
      state: 'awaiting-coverage',
      coverageVerified: false,
      revision: Number(marker.revision) + 1,
    });
    const fingerprint = createHash('sha256')
      .update(JSON.stringify([transactionId, marker.revision, previous, next]))
      .digest('hex');
    return work.commit({
      key: { ...markerKey, SK: `COVERAGE_APPLICATION_RECEIPT#${fingerprint}` },
      fingerprint,
      result: { applied: true },
      expiresAt: Math.floor(Date.now() / 1000) + 86400,
    });
  }
}
