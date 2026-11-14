import { loadCanonicalFinanceFact } from './canonical-spend-source.js';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { dynamodb, tableName } from '../shared/dynamodb.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import type { FinanceFact } from './query-contract.js';
import { ulidSchema } from '@naaseh/domain';
import { createFinanceAccountReadSummary } from './account-read-summary.js';
import { financeReadKeys } from './read-repository.js';
import { addFinanceCoverageUses, validFinanceCoverageCounts } from './coverage-application.js';
import { FinanceExperienceFailure } from './telemetry.js';
import {
  financeSourceDependencyIndexVersion,
  financePublicationFingerprint,
} from './source-dependency-index.js';
import {
  projectionDependencyKey,
  projectionDependencyFormat,
} from './projection-dependency-directory.js';

type CanonicalRow = FinanceRecordKey & {
  collection: string;
  entryKey: string;
  data: { id: string; accountId: string; version: number };
};
type Checkpoint = {
  scopeRevision: number;
  markerRevision: number;
  cursor?: FinanceRecordKey;
  verified: number;
  examined: number;
  digest: string;
  dependencies: Record<string, number>;
  complete: boolean;
  sourceAccountProofVersion: 1;
  originalSourceAccountIds: string[];
  orderedIndexVerified?: boolean;
  dependencyRegistryVersion: 1;
  registryOffset: number;
  enumerationComplete: boolean;
  sourceDependencyIndexVersion: 1;
  incrementalCoverageVersion: 1;
  coverageGeneration: string;
  dependencyUseCounts: Record<string, number>;
  originalSourceUseCounts: Record<string, number>;
};
const fail = (message: string): never => {
  throw new FinanceExperienceFailure('invariant', message);
};
const restart = (): never => {
  throw new FinanceExperienceFailure(
    'capacity',
    'Finance coverage revision changed; restart required.',
    'user',
  );
};
const normalizeFact = (fact: FinanceFact) => {
  const value = { ...fact };
  delete value.textMonth;
  delete value.textOrdinal;
  return JSON.parse(JSON.stringify(value)) as unknown;
};

/** Trusted migration computation, never an interactive query or a caller-supplied coverage flag.
 * The canonical resolver must rebuild the fact using shared spend/refund rules and report every
 * canonical scope/catalog META revision it read. Production resolver/publication wiring is separate.
 */
export class FinanceAccountCoverageVerifier {
  private readonly work: () => FinanceUnitOfWork;
  private readonly pageSize: number;
  constructor(
    private readonly options: {
      work?: () => FinanceUnitOfWork;
      pageSize?: number;
      readPage?: (
        partition: string,
        cursor: FinanceRecordKey | undefined,
        limit: number,
      ) => Promise<{ rows: CanonicalRow[]; nextKey?: FinanceRecordKey }>;
      expectedFact?: (row: CanonicalRow) => Promise<{
        fact: FinanceFact;
        dependencies: Record<string, number>;
        sourceKey?: FinanceRecordKey;
      }>;
    } = {},
  ) {
    this.work = options.work ?? (() => new FinanceUnitOfWork());
    this.pageSize = options.pageSize ?? 5;
    if (!Number.isInteger(this.pageSize) || this.pageSize < 1 || this.pageSize > 5)
      throw new Error('Coverage page must contain 1–5 sources.');
  }
  async step(accountId: string, options: { restart?: boolean } = {}) {
    const work = this.work();
    const account = await loadTargetedFinanceEntity<{ id: string }>(work, 'accounts', accountId);
    if (!account || account.value.id !== accountId)
      return fail('Finance canonical account coverage is unavailable.');
    const markerKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${accountId}`, SK: 'CURRENT' };
    const checkpointKey = { ...markerKey, SK: 'COVERAGE_CHECKPOINT' };
    const marker = await work.get(markerKey);
    let revision = Number(marker?.revision ?? 0);
    if (!Number.isSafeInteger(revision) || revision < 0 || marker?.state === 'rebuilding')
      return restart();
    const stored = (await work.get(checkpointKey))?.data as Checkpoint | undefined;
    const saved = options.restart ? undefined : stored;
    // Older partial proofs did not accumulate original-account identities. They
    // cannot certify that the tail of a resumed enumeration is the whole set.
    if (
      saved &&
      (saved.sourceAccountProofVersion !== 1 ||
        saved.dependencyRegistryVersion !== 1 ||
        saved.sourceDependencyIndexVersion !== financeSourceDependencyIndexVersion ||
        saved.incrementalCoverageVersion !== 1)
    )
      return restart();
    if (marker && (options.restart || (!saved && marker.incrementalCoverageVersion === 1))) {
      revision++;
      await work.put({
        ...marker,
        state: 'awaiting-coverage',
        coverageVerified: false,
        revision,
        incrementalCoverageVersion: 0,
      });
    }
    if (
      saved &&
      (!Number.isSafeInteger(saved.verified) ||
        saved.verified < 0 ||
        !Number.isSafeInteger(saved.examined) ||
        saved.examined < saved.verified ||
        typeof saved.complete !== 'boolean' ||
        typeof saved.enumerationComplete !== 'boolean' ||
        !Number.isSafeInteger(saved.registryOffset) ||
        saved.registryOffset < 0 ||
        typeof saved.digest !== 'string' ||
        typeof saved.coverageGeneration !== 'string' ||
        !/^[a-f0-9]{64}$/.test(saved.coverageGeneration) ||
        (saved.orderedIndexVerified !== undefined &&
          typeof saved.orderedIndexVerified !== 'boolean') ||
        !Array.isArray(saved.originalSourceAccountIds) ||
        saved.originalSourceAccountIds.length > 100 ||
        saved.originalSourceAccountIds.some((id) => !ulidSchema.safeParse(id).success) ||
        !saved.dependencies ||
        typeof saved.dependencies !== 'object' ||
        Array.isArray(saved.dependencies) ||
        !validFinanceCoverageCounts(saved.dependencyUseCounts, 'scope', saved.verified) ||
        !validFinanceCoverageCounts(saved.originalSourceUseCounts, 'account', saved.verified) ||
        Object.keys(saved.dependencyUseCounts).some((PK) => saved.dependencies[PK] === undefined) ||
        !isDeepStrictEqual(
          Object.keys(saved.originalSourceUseCounts).sort(),
          saved.originalSourceAccountIds,
        ))
    )
      return fail('Finance coverage checkpoint invariant failed.');
    if (
      saved &&
      (saved.scopeRevision !== account.scopeRevision ||
        revision !== saved.markerRevision + (saved.complete ? 1 : 0))
    )
      return restart();
    const checkpoint: Checkpoint = saved
      ? structuredClone(saved)
      : {
          scopeRevision: account.scopeRevision,
          markerRevision: revision,
          verified: 0,
          examined: 0,
          digest: '',
          dependencies: { [account.scopeKey.PK]: account.scopeRevision },
          complete: false,
          sourceAccountProofVersion: 1,
          originalSourceAccountIds: [],
          orderedIndexVerified: true,
          dependencyRegistryVersion: 1,
          registryOffset: 0,
          enumerationComplete: false,
          sourceDependencyIndexVersion: financeSourceDependencyIndexVersion,
          incrementalCoverageVersion: 1,
          coverageGeneration: createHash('sha256')
            .update(JSON.stringify([accountId, revision, account.scopeRevision]))
            .digest('hex'),
          dependencyUseCounts: {},
          originalSourceUseCounts: {},
        };
    const dependencyEntries = () => {
      const entries = Object.entries(checkpoint.dependencies);
      if (entries.length > 80)
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance coverage dependency budget exceeded.',
          'user',
        );
      for (const [PK, expected] of entries) {
        if (
          (!PK.startsWith('FINANCE#SCOPE#') && PK !== 'FINANCE#CATALOG') ||
          !Number.isSafeInteger(expected) ||
          expected < 0
        )
          return fail('Finance coverage source invariant failed.');
      }
      return entries;
    };
    const validateDependencies = async () => {
      for (const [PK, expected] of dependencyEntries()) {
        if ((await work.get({ PK, SK: 'META' }))?.revision !== expected) return restart();
      }
    };
    const persist = async () => {
      await work.put({ ...checkpointKey, data: checkpoint });
      const result = {
        complete: checkpoint.complete,
        verified: checkpoint.verified,
        examined: checkpoint.examined,
      };
      const fingerprint = createHash('sha256').update(JSON.stringify(checkpoint)).digest('hex');
      return work.commit({
        key: { ...markerKey, SK: `COVERAGE_RECEIPT#${fingerprint}` },
        fingerprint,
        result,
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
      });
    };
    const cardinalityMatches = async () => {
      const cardinality = await work.get({
        PK: `FINANCE#FACT_ACCOUNT#${accountId}`,
        SK: 'CARDINALITY',
      });
      if (
        (cardinality &&
          (!Number.isSafeInteger(cardinality.facts) || Number(cardinality.facts) < 0)) ||
        (cardinality?.facts ?? 0) !== checkpoint.verified
      )
        return fail('Finance projection cardinality does not match canonical coverage.');
    };
    const keys = dependencyEntries()
      .map(([PK]) => PK)
      .sort();
    if (
      checkpoint.registryOffset > keys.length ||
      (checkpoint.complete &&
        (!checkpoint.enumerationComplete || checkpoint.registryOffset !== keys.length))
    )
      return fail('Finance dependency registry checkpoint is invalid.');
    if (!checkpoint.enumerationComplete || checkpoint.complete) await validateDependencies();
    if (checkpoint.complete) {
      if (
        marker?.state !== 'ready' ||
        marker.coverageVerified !== true ||
        marker.sourceAccountProofVersion !== 1 ||
        marker.coverageDependencyRegistryVersion !== 1 ||
        marker.sourceDependencyIndexVersion !== financeSourceDependencyIndexVersion ||
        marker.incrementalCoverageVersion !== 1 ||
        marker.coverageSourceCount !== checkpoint.verified ||
        marker.coverageGeneration !== checkpoint.coverageGeneration ||
        !isDeepStrictEqual(marker.coverageDependencyUseCounts, checkpoint.dependencyUseCounts) ||
        !isDeepStrictEqual(
          marker.coverageOriginalSourceUseCounts,
          checkpoint.originalSourceUseCounts,
        ) ||
        !isDeepStrictEqual(marker.originalSourceAccountIds, checkpoint.originalSourceAccountIds)
      )
        return restart();
      if ((marker.accountIndexOrderVersion === 1) !== Boolean(checkpoint.orderedIndexVerified))
        return restart();
      return { complete: true, verified: checkpoint.verified, examined: checkpoint.examined };
    }
    if (checkpoint.enumerationComplete) {
      // Only this batch's META and directory rows are touched until the final
      // check. Eighty scopes plus ten directory rows still fit the atomic limit.
      for (const PK of keys.slice(checkpoint.registryOffset, checkpoint.registryOffset + 10)) {
        if ((await work.get({ PK, SK: 'META' }))?.revision !== checkpoint.dependencies[PK])
          return restart();
        const key = projectionDependencyKey(PK, accountId);
        const existing = await work.get(key);
        if (existing) {
          if (
            existing.format !== projectionDependencyFormat ||
            existing.accountId !== accountId ||
            existing.dependencyScope !== PK
          )
            return fail('Finance dependency registry identity invariant failed.');
        } else
          await work.put({
            ...key,
            format: projectionDependencyFormat,
            accountId,
            dependencyScope: PK,
          });
      }
      checkpoint.registryOffset = Math.min(keys.length, checkpoint.registryOffset + 10);
      if (checkpoint.registryOffset === keys.length) {
        await validateDependencies();
        await cardinalityMatches();
        checkpoint.complete = true;
        await work.put({
          ...markerKey,
          state: 'ready',
          coverageVerified: true,
          sourceScopeRevision: account.scopeRevision,
          revision: revision + 1,
          coverageDependencies: checkpoint.dependencies,
          coverageDigest: checkpoint.digest,
          sourceAccountProofVersion: 1,
          originalSourceAccountIds: checkpoint.originalSourceAccountIds,
          coverageDependencyRegistryVersion: 1,
          sourceDependencyIndexVersion: financeSourceDependencyIndexVersion,
          incrementalCoverageVersion: 1,
          coverageGeneration: checkpoint.coverageGeneration,
          coverageDependencyUseCounts: checkpoint.dependencyUseCounts,
          coverageOriginalSourceUseCounts: checkpoint.originalSourceUseCounts,
          coverageSourceCount: checkpoint.verified,
          ...(Number(marker?.coverageDeferredSourceCount ?? 0) > 0
            ? { coverageDeferredSourceCount: marker!.coverageDeferredSourceCount }
            : {}),
          ...(checkpoint.orderedIndexVerified ? { accountIndexOrderVersion: 1 } : {}),
        });
      }
      return persist();
    }
    const page = this.options.readPage
      ? await this.options.readPage(account.storageKey.PK, checkpoint.cursor, this.pageSize)
      : await this.readPage(account.storageKey.PK, checkpoint.cursor);
    if (page.rows.length > this.pageSize) return fail('Finance coverage page bound failed.');
    if (
      page.nextKey &&
      (page.nextKey.PK !== account.storageKey.PK ||
        !page.nextKey.SK.startsWith('ROW#transactions#') ||
        (checkpoint.cursor && page.nextKey.SK <= checkpoint.cursor.SK))
    )
      return fail('Finance coverage cursor invariant failed.');
    for (const row of page.rows) {
      if (
        row.PK !== account.storageKey.PK ||
        row.collection !== 'transactions' ||
        !row.SK.startsWith('ROW#transactions#') ||
        row.entryKey !== row.data.id
      )
        return fail('Finance canonical source identity invariant failed.');
      if (row.data.accountId !== accountId) continue;
      const expected = this.options.expectedFact
        ? await this.options.expectedFact(row)
        : await loadCanonicalFinanceFact(row.entryKey, this.work);
      if (
        (expected.sourceKey &&
          (expected.sourceKey.PK !== row.PK || expected.sourceKey.SK !== row.SK)) ||
        expected.fact.id !== row.entryKey ||
        expected.fact.accountId !== accountId ||
        expected.fact.sourceVersion !== row.data.version
      )
        return fail('Finance canonical projection source invariant failed.');
      for (const [PK, sourceRevision] of Object.entries(expected.dependencies)) {
        if (
          checkpoint.dependencies[PK] !== undefined &&
          checkpoint.dependencies[PK] !== sourceRevision
        )
          return restart();
        checkpoint.dependencies[PK] = sourceRevision;
      }
      const projected = (await work.get({ PK: `FINANCE#FACT#${row.entryKey}`, SK: 'CURRENT' }))
        ?.fact as FinanceFact | undefined;
      if (!projected || !isDeepStrictEqual(normalizeFact(projected), normalizeFact(expected.fact)))
        return fail('Finance projection does not match its canonical source.');
      const reference = await work.get({
        PK: financeReadKeys.account(accountId),
        SK: financeReadKeys.date(projected),
      });
      if (!reference || reference.transactionId !== projected.id)
        return fail('Finance canonical account index reference is missing or invalid.');
      if (reference.aggregate === undefined) checkpoint.orderedIndexVerified = false;
      else if (!isDeepStrictEqual(reference.aggregate, createFinanceAccountReadSummary(projected)))
        return fail('Finance account aggregate index does not match its canonical source.');
      if (projected.effectiveAt !== new Date(projected.effectiveAt).toISOString())
        checkpoint.orderedIndexVerified = false;
      const publicationRow = await work.get({
        PK: `FINANCE#TRANSACTION#${projected.id}`,
        SK: 'SPEND_CONTRIBUTION',
      });
      const publication = publicationRow?.data as
        | {
            state?: string;
            dependencyIndexVersion?: number;
            fingerprint?: string;
            calendarBasis?: string;
          }
        | undefined;
      if (
        publication?.state !== 'complete' ||
        publication.dependencyIndexVersion !== financeSourceDependencyIndexVersion ||
        publication.fingerprint !==
          financePublicationFingerprint(projected, publication.calendarBasis ?? 'UTC')
      )
        return fail('Finance source dependency publication is incomplete; upgrade required.');
      const dependencyScopes = Object.keys(expected.dependencies).sort();
      const originalSourceAccountIds = [
        ...new Set(expected.fact.originalSourceAccountIds ?? []),
      ].sort();
      addFinanceCoverageUses(checkpoint.dependencyUseCounts, dependencyScopes);
      addFinanceCoverageUses(checkpoint.originalSourceUseCounts, originalSourceAccountIds);
      await work.put({
        ...publicationRow!,
        data: {
          ...publication,
          coverageApplication: {
            version: 1,
            generation: checkpoint.coverageGeneration,
            fingerprint: publication.fingerprint,
            dependencyScopes,
            originalSourceAccountIds,
          },
        },
      });
      checkpoint.originalSourceAccountIds = [
        ...new Set([
          ...checkpoint.originalSourceAccountIds,
          ...(expected.fact.originalSourceAccountIds ?? []),
        ]),
      ].sort();
      if (checkpoint.originalSourceAccountIds.some((id) => !ulidSchema.safeParse(id).success))
        return fail('Finance original source account invariant failed.');
      if (checkpoint.originalSourceAccountIds.length > 100)
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance source account bound exceeded.',
          'user',
        );
      checkpoint.verified++;
      checkpoint.digest = createHash('sha256')
        .update(JSON.stringify([checkpoint.digest, normalizeFact(expected.fact)]))
        .digest('hex');
    }
    checkpoint.examined += page.rows.length;
    if (checkpoint.examined > 1_000_000)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance canonical coverage enumeration budget exceeded.',
        'user',
      );
    await validateDependencies();
    if (page.nextKey) checkpoint.cursor = page.nextKey;
    else {
      delete checkpoint.cursor;
      checkpoint.enumerationComplete = true;
    }
    return persist();
  }
  private async readPage(PK: string, cursor?: FinanceRecordKey) {
    const result = await dynamodb.send(
      new QueryCommand({
        TableName: tableName,
        ConsistentRead: true,
        Limit: this.pageSize,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
        ExpressionAttributeValues: { ':pk': PK, ':prefix': 'ROW#transactions#' },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      }),
    );
    return {
      rows: (result.Items ?? []) as CanonicalRow[],
      ...(result.LastEvaluatedKey ? { nextKey: result.LastEvaluatedKey as FinanceRecordKey } : {}),
    };
  }
}
