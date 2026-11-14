import { createHash } from 'node:crypto';
import {
  addMinorUnits,
  buildSpendSlices,
  localFinanceDate,
  type FinancialTransaction,
  type SpendContext,
  type SpendSlice,
  createUlid,
} from '@naaseh/domain';
import { financeReadKeys } from './read-repository.js';
import type { FinanceFact } from './query-contract.js';
import { createFinanceAccountReadSummary } from './account-read-summary.js';
import {
  validFinanceCoverageApplication,
  validFinanceCoverageCounts,
  type FinanceCoverageApplication,
} from './coverage-application.js';
import {
  loadFinanceDeletedTransaction,
  loadFinanceDeletedAccount,
} from './publication-deletion-proof.js';
import { assertRetiringUnappliedCreation } from './publication-retired-creation.js';
import { assertFinanceSourceCreation } from './publication-creation-proof.js';
import {
  financeFactSourceDependencies,
  financePublicationFingerprint,
  financePublicationSource,
  sameFinancePublicationSource,
  financeSourceDependencyIndexVersion,
} from './source-dependency-index.js';
import {
  financeTextGrams,
  financeFactSearchText,
  textPostingKey,
  textOrdinalKey,
  updateTextPostingBit,
  textPostingOrdinals,
} from './text-postings.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import {
  emitFinanceExperienceEvent,
  FinanceExperienceFailure,
  financeExperienceFailureDetails,
  financeExperienceFailureOutcome,
} from './telemetry.js';

export interface SpendPublication {
  transactionId: string;
  sourceVersion: number;
  relationshipVersion?: number;
  slices: SpendSlice[];
}

/** Persistence conditions on this revision before applying the reversal/new contribution. */
export function contributionDelta(
  previous: SpendPublication | undefined,
  next: SpendPublication,
): SpendSlice[] {
  if (previous && previous.transactionId !== next.transactionId)
    throw new Error('Contribution identity mismatch.');
  if (
    previous &&
    previous.sourceVersion === next.sourceVersion &&
    previous.relationshipVersion === next.relationshipVersion
  )
    return [];
  return [
    ...(previous?.slices ?? []).map((slice) => ({ ...slice, amountMinor: -slice.amountMinor })),
    ...next.slices,
  ];
}

export function createFinanceFact(
  transaction: FinancialTransaction,
  context: SpendContext,
  merchantName?: string,
): FinanceFact {
  const metadata = transaction as FinancialTransaction & { checkNumber?: string };
  return {
    id: transaction.id,
    accountId: transaction.accountId,
    effectiveAt: new Date(transaction.effectiveAt).toISOString(),
    amountMinor: transaction.amountMinor,
    currency: transaction.currency,
    currencyExponent: transaction.currencyExponent,
    description: transaction.description,
    sourceVersion: transaction.version,
    sourceStatus: transaction.status,
    pending: transaction.pending,
    provisional: transaction.reconciliationState === 'provisional',
    slices: buildSpendSlices(transaction, context),
    ...(transaction.payee ? { payee: transaction.payee } : {}),
    ...(transaction.memo ? { memo: transaction.memo } : {}),
    ...(merchantName ? { merchantName } : {}),
    ...(transaction.merchantId ? { merchantId: transaction.merchantId } : {}),
    ...(metadata.checkNumber ? { checkNumber: metadata.checkNumber.trim() } : {}),
    ...(context.refund && context.original
      ? { originalSourceAccountIds: [context.original.accountId] }
      : {}),
  };
}

/** References only; full text is kept in the canonical fact rather than repeated per posting. */
export function financeFactReferences(
  fact: FinanceFact,
  legacyTextReferences = false,
  sourceDependencies = true,
): Array<FinanceRecordKey & { transactionId: string; accountId?: string }> {
  const partitions = new Set([financeReadKeys.account(fact.accountId)]);
  const add = (kind: string, id: string | undefined) => {
    if (id) partitions.add(financeReadKeys.dimension(fact.accountId, kind, id));
  };
  add('merchant', fact.merchantId);
  for (const slice of fact.slices) {
    add('budget', slice.budgetId);
    add('category', slice.categoryId);
    add('subcategory', slice.subcategoryId);
  }
  if (fact.checkNumber)
    partitions.add(financeReadKeys.probe(fact.accountId, 'check', fact.checkNumber));
  partitions.add(
    financeReadKeys.probe(fact.accountId, 'amount', `${fact.currency}:${fact.amountMinor}`),
  );
  partitions.add(financeReadKeys.probe(fact.accountId, 'amount', `*:${fact.amountMinor}`));
  if (legacyTextReferences)
    for (const gram of financeTextGrams(financeFactSearchText(fact), 3, 3))
      partitions.add(financeReadKeys.probe(fact.accountId, 'text', gram));
  const references = [...partitions]
    .sort()
    .map((PK) => ({ PK, SK: financeReadKeys.date(fact), transactionId: fact.id }));
  return sourceDependencies ? [...references, ...financeFactSourceDependencies(fact)] : references;
}

type ProjectionCheckpoint = {
  deletion?: {
    publicationId: string;
    accountId: string;
    unappliedCreationPublicationId?: string;
    retiredAccountPublicationId?: string;
  };
  creationPublicationId?: string;
  creationCoverageGeneration?: string;
  coverageApplication?: FinanceCoverageApplication;
  operation: string;
  offset: number;
  previous?: FinanceFact;
  next?: FinanceFact;
  state: 'rebuilding' | 'complete';
  sourceScopeRevision?: number;
  startedAt?: number;
  calendarBasis?: string;
  previousCalendarBasis?: string;
  fingerprint?: string;
  textPostingVersion?: number;
  previousTextPostingVersion?: number;
  dependencyIndexVersion?: number;
  previousDependencyIndexVersion?: number;
};
const keyId = (key: FinanceRecordKey) => JSON.stringify([key.PK, key.SK]);
function projectionSum(values: readonly number[]) {
  try {
    return addMinorUnits(values);
  } catch {
    throw new FinanceExperienceFailure('invariant', 'Finance projection amount invariant failed.');
  }
}
function textPostings(fact: FinanceFact | undefined, maxGram = 3) {
  if (!fact || fact.textOrdinal === undefined || !fact.textMonth) return [];
  return financeTextGrams(financeFactSearchText(fact), 1, maxGram).map((gram) => ({
    key: textPostingKey(fact.accountId, gram, fact.textMonth!, fact.textOrdinal!),
    ordinal: fact.textOrdinal!,
    month: fact.textMonth!,
  }));
}

/** Restartable index publication; account coverage stays rebuilding until every reference/summary commits. */
export class SpendProjectionService {
  constructor(private readonly work: () => FinanceUnitOfWork = () => new FinanceUnitOfWork()) {}
  /** Finish the exact durable input before processing a later canonical source version. */
  async resumePending(transactionId: string): Promise<boolean> {
    const row = await this.work().get({
      PK: `FINANCE#TRANSACTION#${transactionId}`,
      SK: 'SPEND_CONTRIBUTION',
    });
    const checkpoint = row?.data as ProjectionCheckpoint | undefined;
    if (!checkpoint || checkpoint.state !== 'rebuilding') return false;
    if (!checkpoint.next)
      throw new FinanceExperienceFailure(
        'invariant',
        'Finance publication checkpoint is incomplete.',
      );
    const input = financePublicationSource(checkpoint.next);
    await this.run(input, checkpoint.calendarBasis ?? 'UTC', undefined, checkpoint.deletion);
    return true;
  }
  async publish(next: FinanceFact, calendarBasis = 'UTC'): Promise<void> {
    await this.run(next, calendarBasis);
  }
  /** One durable mutation (start, reference batch or finish); stored order/receipts are unchanged. */
  async publishStep(
    next: FinanceFact,
    calendarBasis = 'UTC',
    options: { creationPublicationId?: string } = {},
  ): Promise<boolean> {
    return this.run(
      next,
      calendarBasis,
      { remaining: 1 },
      undefined,
      options.creationPublicationId,
    );
  }
  /** Only a canonical deletion proof may begin cleanup; resume the frozen operation first. */
  async removeStep(
    transactionId: string,
    accountId: string,
    creationPublicationId?: string,
  ): Promise<boolean> {
    const resumed = await this.resumePendingStep(transactionId);
    if (resumed.pending) return false;
    const work = this.work();
    const proof = await loadFinanceDeletedTransaction(transactionId, work);
    if (!proof || !proof.accountIds.includes(accountId))
      throw new FinanceExperienceFailure(
        'invariant',
        'Finance physical deletion proof is unavailable.',
      );
    const fact = (await work.get(financeReadKeys.fact(transactionId)))?.fact as
      | FinanceFact
      | undefined;
    const checkpoint = (
      await work.get({ PK: `FINANCE#TRANSACTION#${transactionId}`, SK: 'SPEND_CONTRIBUTION' })
    )?.data as ProjectionCheckpoint | undefined;
    if (!fact) {
      if (checkpoint?.coverageApplication !== undefined)
        throw new FinanceExperienceFailure(
          'invariant',
          'Finance deleted source projection is incomplete.',
        );
      return true;
    }
    if (fact.accountId !== accountId)
      throw new FinanceExperienceFailure(
        'invariant',
        'Finance deletion account identity conflicts.',
      );
    const creation = creationPublicationId ?? checkpoint?.creationPublicationId;
    const retired =
      checkpoint?.coverageApplication === undefined &&
      creation &&
      !(await loadTargetedFinanceEntity(work, 'accounts', accountId))
        ? await loadFinanceDeletedAccount(accountId, work)
        : undefined;
    return this.run(
      fact,
      'UTC',
      { remaining: 1 },
      {
        publicationId: proof.publicationId,
        accountId,
        ...(checkpoint?.coverageApplication === undefined && creation
          ? { unappliedCreationPublicationId: creation }
          : {}),
        ...(retired ? { retiredAccountPublicationId: retired.publicationId } : {}),
      },
    );
  }
  async resumePendingStep(transactionId: string): Promise<{ pending: boolean; complete: boolean }> {
    const row = await this.work().get({
      PK: `FINANCE#TRANSACTION#${transactionId}`,
      SK: 'SPEND_CONTRIBUTION',
    });
    const checkpoint = row?.data as ProjectionCheckpoint | undefined;
    if (!checkpoint || checkpoint.state !== 'rebuilding') return { pending: false, complete: true };
    if (!checkpoint.next)
      throw new FinanceExperienceFailure(
        'invariant',
        'Finance publication checkpoint is incomplete.',
      );
    return {
      pending: true,
      complete: await this.run(
        financePublicationSource(checkpoint.next),
        checkpoint.calendarBasis ?? 'UTC',
        { remaining: 1 },
        checkpoint.deletion,
      ),
    };
  }
  private async run(
    next: FinanceFact,
    calendarBasis: string,
    budget?: { remaining: number },
    deletion?: ProjectionCheckpoint['deletion'],
    creationPublicationId?: string,
  ): Promise<boolean> {
    const started = performance.now();
    const correlationId = createUlid();
    try {
      const publicationStartedAt = await this.publishBounded(
        next,
        calendarBasis,
        budget,
        deletion,
        creationPublicationId,
      );
      emitFinanceExperienceEvent({
        operation: 'projection',
        outcome: publicationStartedAt === null ? 'pending' : 'success',
        ...(publicationStartedAt !== undefined && publicationStartedAt !== null
          ? { projectionLagMs: Math.max(0, Date.now() - publicationStartedAt) }
          : {}),
        correlationId,
        durationMs: performance.now() - started,
      });
      return publicationStartedAt !== null;
    } catch (error) {
      emitFinanceExperienceEvent({
        operation: 'projection',
        outcome: financeExperienceFailureOutcome(error),
        correlationId,
        durationMs: performance.now() - started,
        ...financeExperienceFailureDetails(error),
      });
      throw error;
    }
  }

  private blockedPublication(message: string, startedAt?: number): never {
    const age =
      startedAt !== undefined && Number.isFinite(startedAt)
        ? Math.max(0, Date.now() - startedAt)
        : undefined;
    const stalled = age !== undefined && age >= 15 * 60_000;
    throw new FinanceExperienceFailure(
      stalled ? 'stalled' : 'capacity',
      stalled ? 'Finance projection is stalled; resume or repair its checkpoint.' : message,
      'automatic',
      age,
    );
  }

  private async publishBounded(
    next: FinanceFact,
    calendarBasis: string,
    budget?: { remaining: number },
    deletion?: ProjectionCheckpoint['deletion'],
    creationPublicationId?: string,
  ): Promise<number | undefined | null> {
    if (budget && budget.remaining <= 0) return null;
    const input = next;
    const fingerprint = deletion
      ? createHash('sha256')
          .update(JSON.stringify(['physical-deletion-v1', next.id, deletion]))
          .digest('hex')
      : financePublicationFingerprint(next, calendarBasis);
    let operation = fingerprint;
    const checkpointKey = { PK: `FINANCE#TRANSACTION#${next.id}`, SK: 'SPEND_CONTRIBUTION' };
    const accountKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${next.accountId}`, SK: 'CURRENT' };
    let checkpoint: ProjectionCheckpoint;
    {
      const work = this.work();
      const stored = await work.get(checkpointKey);
      const current = stored?.data as ProjectionCheckpoint | undefined;
      if (
        (current?.textPostingVersion !== undefined &&
          ![1, 2].includes(current.textPostingVersion)) ||
        (current?.dependencyIndexVersion !== undefined &&
          ![0, financeSourceDependencyIndexVersion].includes(current.dependencyIndexVersion))
      )
        throw new FinanceExperienceFailure(
          'capacity',
          'Unsupported Finance publication format; upgrade required.',
          'user',
        );
      const currentFingerprint = current?.fingerprint ?? current?.operation;
      const sameInput =
        currentFingerprint === fingerprint ||
        (!deletion &&
          !current?.deletion &&
          current?.state === 'rebuilding' &&
          current.next &&
          (current.calendarBasis ?? 'UTC') === calendarBasis &&
          sameFinancePublicationSource(current.next, next));
      if (
        sameInput &&
        current?.state === 'complete' &&
        current.textPostingVersion === 2 &&
        current.dependencyIndexVersion === financeSourceDependencyIndexVersion
      )
        return Date.now();
      if (current?.state === 'rebuilding' && !sameInput)
        this.blockedPublication(
          'Finance projection publication already in progress.',
          current.startedAt,
        );
      // A later transition may return to earlier input. Its receipts must be fresh,
      // while an interrupted transition must retain its original receipt identities.
      operation =
        current?.state === 'rebuilding'
          ? current.operation
          : createHash('sha256')
              .update(JSON.stringify([fingerprint, current?.operation ?? null]))
              .digest('hex');
      const marker = await work.get(accountKey);
      if (marker?.state === 'rebuilding' && marker.operation !== operation)
        this.blockedPublication(
          'Finance account projection is rebuilding.',
          typeof marker.startedAt === 'number' ? marker.startedAt : undefined,
        );
      if (current?.operation === operation) checkpoint = current;
      else {
        if (deletion) {
          const proof = await loadFinanceDeletedTransaction(next.id, work);
          if (
            !proof ||
            proof.publicationId !== deletion.publicationId ||
            !proof.accountIds.includes(next.accountId)
          )
            throw new FinanceExperienceFailure(
              'capacity',
              'Finance deletion source changed; retry required.',
              'automatic',
            );
          const applied = current?.coverageApplication;
          if (applied === undefined && deletion.unappliedCreationPublicationId) {
            const account = await loadTargetedFinanceEntity(work, 'accounts', next.accountId);
            if (!marker)
              throw new FinanceExperienceFailure(
                'invariant',
                'Finance unapplied deletion account is unavailable.',
              );
            if (!account) {
              if (
                !deletion.retiredAccountPublicationId ||
                current?.creationPublicationId !== deletion.unappliedCreationPublicationId ||
                current.creationCoverageGeneration !== marker.coverageGeneration
              )
                throw new FinanceExperienceFailure(
                  'invariant',
                  'Finance retiring source lacks a proven unapplied creation.',
                );
              await assertRetiringUnappliedCreation(work, {
                transactionId: next.id,
                accountId: next.accountId,
                creationPublicationId: deletion.unappliedCreationPublicationId,
                retirementPublicationId: deletion.retiredAccountPublicationId,
                sourceDeletion: proof,
              });
            } else
              await assertFinanceSourceCreation(work, {
                publicationId: deletion.unappliedCreationPublicationId,
                transactionId: next.id,
                accountId: next.accountId,
                scopePK: account.storageKey.PK,
                sourceVersion: proof.beforeVersion,
                marker,
                deletedAt: { PK: proof.scopePK, revision: proof.revision },
              });
          } else if (
            !validFinanceCoverageApplication(applied) ||
            applied.generation !== marker?.coverageGeneration
          )
            throw new FinanceExperienceFailure(
              'invariant',
              'Finance deletion coverage application is unavailable.',
            );
        }
        const fact = (await work.get(financeReadKeys.fact(next.id)))?.fact as
          | FinanceFact
          | undefined;
        if (creationPublicationId && current?.coverageApplication === undefined) {
          if (
            !marker ||
            marker.incrementalCoverageVersion !== 1 ||
            typeof marker.coverageGeneration !== 'string' ||
            !/^[a-f0-9]{64}$/.test(marker.coverageGeneration)
          )
            throw new FinanceExperienceFailure(
              'invariant',
              'Finance new source requires its trusted coverage generation.',
            );
          await assertFinanceSourceCreation(work, {
            publicationId: creationPublicationId,
            transactionId: next.id,
            accountId: next.accountId,
            scopePK: (await loadTargetedFinanceEntity(work, 'accounts', next.accountId))!.storageKey
              .PK,
            sourceVersion: Number(next.sourceVersion),
            marker,
          });
        }
        if (fact && (fact.accountId !== next.accountId || fact.sourceVersion > next.sourceVersion))
          throw new FinanceExperienceFailure(
            'capacity',
            'Finance projection source conflict.',
            'user',
          );
        const month = next.effectiveAt.slice(0, 7);
        let ordinal = fact?.textMonth === month ? fact.textOrdinal : undefined;
        if (ordinal === undefined && !deletion) {
          const counterKey = {
            PK: `FINANCE#TEXT_ORDINAL#${next.accountId}#${month}`,
            SK: 'CURRENT',
          };
          const counter = await work.get(counterKey);
          ordinal = Number(counter?.nextOrdinal ?? 0);
          if (!Number.isSafeInteger(ordinal) || ordinal < 0 || ordinal >= 1_000_000)
            throw new FinanceExperienceFailure(
              'capacity',
              'Finance text ordinal capacity exceeded.',
              'user',
            );
          await work.put({ ...counterKey, nextOrdinal: ordinal + 1 });
        }
        checkpoint = {
          ...(creationPublicationId && current?.coverageApplication === undefined
            ? {
                creationPublicationId,
                creationCoverageGeneration: String(marker?.coverageGeneration),
              }
            : {}),
          ...(deletion ? { deletion } : {}),
          ...(current?.coverageApplication
            ? { coverageApplication: current.coverageApplication }
            : {}),
          operation,
          fingerprint,
          startedAt: Date.now(),
          offset: 0,
          calendarBasis,
          textPostingVersion: 2,
          dependencyIndexVersion: financeSourceDependencyIndexVersion,
          previousDependencyIndexVersion: current?.dependencyIndexVersion ?? 0,
          previousTextPostingVersion: current?.textPostingVersion ?? 1,
          // Checkpoints written before calendar metadata used the default UTC basis.
          previousCalendarBasis: current?.calendarBasis ?? 'UTC',
          ...(fact ? { previous: fact } : {}),
          next: {
            ...next,
            ...(ordinal !== undefined ? { textOrdinal: ordinal } : {}),
            textMonth: month,
          },
          state: 'rebuilding',
        };
        const account = await loadTargetedFinanceEntity(work, 'accounts', next.accountId);
        if (account) checkpoint.sourceScopeRevision = account.scopeRevision;
        if (Buffer.byteLength(JSON.stringify(checkpoint), 'utf8') > 300_000)
          throw new FinanceExperienceFailure(
            'capacity',
            'Finance projection checkpoint exceeds safe item budget.',
            'user',
          );
        await work.put({ ...checkpointKey, data: checkpoint });
        await work.put({
          ...marker,
          ...accountKey,
          state: 'rebuilding',
          transactionId: next.id,
          coverageVerified: false,
          startedAt: checkpoint.startedAt,
          operation,
          revision: Number(marker?.revision ?? 0) + 1,
        });
        await work.commit({
          key: { ...checkpointKey, SK: `PROJECTION_RECEIPT#${operation}#start` },
          fingerprint: operation,
          result: true,
          expiresAt: Math.floor(Date.now() / 1000) + 86_400,
        });
        if (budget) budget.remaining--;
      }
    }
    if (!checkpoint.next)
      throw new FinanceExperienceFailure(
        'invariant',
        'Finance publication checkpoint is incomplete.',
      );
    next = checkpoint.next;
    const previousRefs = new Map(
      (checkpoint.previous
        ? financeFactReferences(
            checkpoint.previous,
            checkpoint.previousTextPostingVersion !== 2,
            checkpoint.previousDependencyIndexVersion === financeSourceDependencyIndexVersion,
          )
        : []
      ).map((row) => [keyId(row), row]),
    );
    // Finish an interrupted v1 publication with its original operation ordering first.
    // Changing the batch contents underneath a durable offset would skip index writes.
    const legacyPublication = checkpoint.textPostingVersion !== 2;
    const legacyDependencies =
      checkpoint.dependencyIndexVersion !== financeSourceDependencyIndexVersion;
    const nextRefs = new Map(
      (deletion ? [] : financeFactReferences(next, legacyPublication, !legacyDependencies)).map(
        (row) => [keyId(row), row],
      ),
    );
    const oldShort = new Map(
      textPostings(checkpoint.previous, checkpoint.previousTextPostingVersion === 2 ? 3 : 2).map(
        (value) => [keyId(value.key), value],
      ),
    );
    const newShort = new Map(
      (deletion ? [] : textPostings(next, legacyPublication ? 2 : 3)).map((value) => [
        keyId(value.key),
        value,
      ]),
    );
    const operations: Array<{
      key: FinanceRecordKey;
      remove: boolean;
      posting?: { ordinal: number; month: string };
    }> = [
      ...[...previousRefs]
        .filter(([id]) => !nextRefs.has(id))
        .map(([, key]) => ({ key, remove: true })),
      ...[...nextRefs]
        .filter(([id]) => !previousRefs.has(id))
        .map(([, key]) => ({ key, remove: false })),
      ...[...oldShort]
        .filter(([id]) => !newShort.has(id))
        .map(([, value]) => ({ key: value.key, remove: true, posting: value })),
      ...[...newShort]
        .filter(([id]) => !oldShort.has(id))
        .map(([, value]) => ({ key: value.key, remove: false, posting: value })),
    ];
    while (checkpoint.offset < operations.length) {
      if (budget && budget.remaining <= 0) return null;
      const work = this.work();
      const stored = await work.get(checkpointKey);
      const current = stored?.data as ProjectionCheckpoint | undefined;
      if (!current || current.operation !== operation || current.state !== 'rebuilding')
        throw new FinanceExperienceFailure(
          'capacity',
          'Finance projection checkpoint changed.',
          'automatic',
        );
      checkpoint = current;
      const batch = operations.slice(checkpoint.offset, checkpoint.offset + 40);
      for (const entry of batch) {
        const existing = await work.get(entry.key);
        let cardinalityDelta = 0;
        if (entry.posting) {
          const previous = existing?.bits as Uint8Array | undefined;
          const baseOrdinal = Math.floor(entry.posting.ordinal / 500) * 500;
          // Text cardinalities are conservative bucket hints, not exact result
          // counts. Do not rewrite a separate hot counter for every bit change.
          const bits = updateTextPostingBit(
            previous ?? new Uint8Array(63),
            entry.posting.ordinal,
            !entry.remove,
          );
          const remaining = textPostingOrdinals(bits, baseOrdinal).length;
          const previousCount = previous ? textPostingOrdinals(previous, baseOrdinal).length : 0;
          cardinalityDelta = Number(remaining > 0) - Number(previousCount > 0);
          if (remaining)
            await work.put({
              ...entry.key,
              codec: legacyPublication ? 'short-text-v1' : 'text-bitmap-v2',
              month: entry.posting.month,
              baseOrdinal,
              bits,
            });
          else await work.delete(entry.key);
        } else if (entry.remove) {
          cardinalityDelta = existing ? -1 : 0;
          await work.delete(entry.key);
        } else {
          cardinalityDelta = existing ? 0 : 1;
          await work.put({ ...entry.key });
        }
        if (cardinalityDelta) {
          if (entry.key.PK.startsWith('FINANCE#FACT_DEPENDENCY#')) continue;
          const countKey = { PK: entry.key.PK, SK: 'CARDINALITY' };
          const counter = await work.get(countKey);
          if (entry.posting) {
            // A legacy exact fact count is an upper bound on occupied chunks.
            // Adopt it conservatively without scanning/rebuilding other buckets.
            const chunks = projectionSum([
              Number(
                counter?.estimateKind === 'posting-chunks-v1'
                  ? counter.chunks
                  : (counter?.facts ?? 0),
              ),
              cardinalityDelta,
            ]);
            if (chunks < 0)
              throw new FinanceExperienceFailure(
                'invariant',
                'Finance text estimate invariant failed.',
              );
            await work.put({ ...countKey, estimateKind: 'posting-chunks-v1', chunks });
            continue;
          }
          // Cleaning an old long-text reference must not alter a bitmap bucket hint.
          if (entry.key.PK.includes('#text#') && counter?.estimateKind === 'posting-chunks-v1')
            continue;
          const facts = projectionSum([Number(counter?.facts ?? 0), cardinalityDelta]);
          if (facts < 0)
            throw new FinanceExperienceFailure(
              'invariant',
              'Finance index cardinality invariant failed.',
            );
          await work.put({ ...countKey, facts });
        }
      }
      const advanced = { ...checkpoint, offset: checkpoint.offset + batch.length };
      await work.put({ ...checkpointKey, data: advanced });
      // A retry resumes the durable cursor instead of republishing prior batches.
      await work.commit({
        key: { ...checkpointKey, SK: `PROJECTION_RECEIPT#${operation}#${checkpoint.offset}` },
        fingerprint: operation,
        result: true,
        expiresAt: Math.floor(Date.now() / 1000) + 86_400,
      });
      checkpoint = advanced;
      if (budget) budget.remaining--;
    }
    if (budget && budget.remaining <= 0) return null;
    const work = this.work();
    const stored = await work.get(checkpointKey);
    const current = stored?.data as ProjectionCheckpoint | undefined;
    const marker = await work.get(accountKey);
    if (!current || current.operation !== operation || marker?.operation !== operation)
      throw new FinanceExperienceFailure(
        'capacity',
        'Finance projection publication conflict.',
        'automatic',
      );
    if (current.state === 'complete') return Date.now();
    // Reverse each publication in the calendar where it was originally counted.
    // Reusing the requested basis for both sides leaves the old summary overstated.
    const deltas = [
      ...(checkpoint.previous?.slices ?? []).map((slice) => ({
        slice: { ...slice, amountMinor: -slice.amountMinor },
        basis: checkpoint.previousCalendarBasis ?? 'UTC',
      })),
      ...(deletion ? [] : next.slices).map((slice) => ({
        slice,
        basis: checkpoint.calendarBasis ?? calendarBasis,
      })),
    ];
    const monthly = new Map<
      string,
      { key: FinanceRecordKey; amount: number; currency: string; currencyExponent: number }
    >();
    for (const { slice, basis } of deltas) {
      const month = localFinanceDate(slice.effectiveAt, basis).slice(0, 7);
      const key = {
        PK: `FINANCE#SUMMARY#${slice.accountId}#${slice.currency}`,
        SK: `MONTH#${basis}#${month}`,
      };
      const id = keyId(key);
      const previous = monthly.get(id);
      monthly.set(id, {
        key,
        amount: projectionSum([previous?.amount ?? 0, slice.amountMinor]),
        currency: slice.currency,
        currencyExponent: slice.currencyExponent,
      });
    }
    for (const { key, amount, currency, currencyExponent } of monthly.values()) {
      const row = await work.get(key);
      if (row && row.currencyExponent !== currencyExponent)
        throw new FinanceExperienceFailure(
          'invariant',
          'Finance summary currency invariant failed.',
        );
      await work.put({
        ...key,
        currency,
        currencyExponent,
        amountMinor: projectionSum([Number(row?.amountMinor ?? 0), amount]),
        version: Number(row?.version ?? 0) + 1,
      });
    }
    if (deletion) await work.delete(financeReadKeys.fact(next.id));
    else await work.put({ ...financeReadKeys.fact(next.id), fact: next });
    // Update even when the date/reference key is unchanged. This commits with
    // the canonical projection fact and stays unavailable until coverage is proved.
    if (!deletion)
      await work.put({
        PK: financeReadKeys.account(next.accountId),
        SK: financeReadKeys.date(next),
        transactionId: next.id,
        aggregate: createFinanceAccountReadSummary(next),
      });
    if (!deletion)
      await work.put({
        ...textOrdinalKey(next.accountId, next.textMonth!, next.textOrdinal!),
        fact: next,
      });
    const old = checkpoint.previous;
    if (
      old?.textMonth &&
      old.textOrdinal !== undefined &&
      (deletion || old.textMonth !== next.textMonth || old.textOrdinal !== next.textOrdinal)
    )
      await work.delete(textOrdinalKey(old.accountId, old.textMonth, old.textOrdinal));
    // The canonical fact is the next publication's reversal source. Once committed,
    // the old copy is only needed by an unfinished batch, not by retained checkpoints.
    const completed = { ...checkpoint };
    delete completed.previous;
    delete completed.next;
    delete completed.previousDependencyIndexVersion;
    let coverageRemoval = {};
    if (
      deletion &&
      checkpoint.coverageApplication === undefined &&
      deletion.unappliedCreationPublicationId
    ) {
      delete completed.coverageApplication;
    } else if (deletion) {
      const applied = checkpoint.coverageApplication;
      const count = Number(marker.coverageSourceCount);
      if (
        !validFinanceCoverageApplication(applied) ||
        applied.generation !== marker.coverageGeneration ||
        !Number.isSafeInteger(count) ||
        count < 1 ||
        !validFinanceCoverageCounts(marker.coverageDependencyUseCounts, 'scope', count) ||
        !validFinanceCoverageCounts(marker.coverageOriginalSourceUseCounts, 'account', count)
      )
        throw new FinanceExperienceFailure(
          'invariant',
          'Finance deletion coverage baseline is invalid.',
        );
      const scopes = { ...marker.coverageDependencyUseCounts },
        originals = { ...marker.coverageOriginalSourceUseCounts };
      const subtract = (counts: Record<string, number>, keys: string[]) => {
        for (const key of keys) {
          if (!Number.isSafeInteger(counts[key]) || counts[key]! < 1)
            throw new FinanceExperienceFailure(
              'invariant',
              'Finance deletion coverage use count is invalid.',
            );
          if (counts[key] === 1) delete counts[key];
          else counts[key]!--;
        }
      };
      subtract(scopes, applied.dependencyScopes);
      subtract(originals, applied.originalSourceAccountIds);
      if (
        !validFinanceCoverageCounts(scopes, 'scope', count - 1) ||
        !validFinanceCoverageCounts(originals, 'account', count - 1)
      )
        throw new FinanceExperienceFailure(
          'invariant',
          'Finance deletion coverage count is inconsistent.',
        );
      coverageRemoval = {
        coverageSourceCount: count - 1,
        coverageDependencyUseCounts: scopes,
        coverageOriginalSourceUseCounts: originals,
        originalSourceAccountIds: Object.keys(originals).sort(),
      };
      delete completed.coverageApplication;
    }
    await work.put({ ...checkpointKey, data: { ...completed, state: 'complete' } });
    await work.put({
      ...marker,
      ...accountKey,
      ...coverageRemoval,
      // Completing one source cannot establish coverage of every canonical transaction/refund.
      state: 'awaiting-coverage',
      transactionId: next.id,
      coverageVerified: false,
      operation,
      revision: Number(marker.revision) + 1,
      ...(checkpoint.sourceScopeRevision !== undefined
        ? { sourceScopeRevision: checkpoint.sourceScopeRevision }
        : {}),
    });
    await work.commit({
      key: { ...checkpointKey, SK: `PROJECTION_RECEIPT#${operation}#finish` },
      fingerprint: operation,
      result: true,
      expiresAt: Math.floor(Date.now() / 1000) + 86_400,
    });
    if (budget) budget.remaining--;
    if (!deletion && (legacyPublication || legacyDependencies))
      return this.publishBounded(input, calendarBasis, budget);
    return checkpoint.startedAt;
  }
}
