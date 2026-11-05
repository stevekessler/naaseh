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
): Array<FinanceRecordKey & { transactionId: string }> {
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
  return [...partitions]
    .sort()
    .map((PK) => ({ PK, SK: financeReadKeys.date(fact), transactionId: fact.id }));
}

type ProjectionCheckpoint = {
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
      throw new FinanceExperienceFailure('invariant', 'Finance publication checkpoint is incomplete.');
    const input = { ...checkpoint.next };
    delete input.textOrdinal;
    delete input.textMonth;
    await this.publish(input, checkpoint.calendarBasis ?? 'UTC');
    return true;
  }
  async publish(next: FinanceFact, calendarBasis = 'UTC'): Promise<void> {
    const started = performance.now();
    const correlationId = createUlid();
    try {
      const publicationStartedAt = await this.publishBounded(next, calendarBasis);
      emitFinanceExperienceEvent({
        operation: 'projection',
        outcome: 'success',
        ...(publicationStartedAt !== undefined
          ? { projectionLagMs: Math.max(0, Date.now() - publicationStartedAt) }
          : {}),
        correlationId,
        durationMs: performance.now() - started,
      });
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
  ): Promise<number | undefined> {
    const input = next;
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ next, calendarBasis, textPostingVersion: 2 }))
      .digest('hex');
    const legacyFingerprint = createHash('sha256')
      .update(JSON.stringify({ next, calendarBasis }))
      .digest('hex');
    let operation = fingerprint;
    const checkpointKey = { PK: `FINANCE#TRANSACTION#${next.id}`, SK: 'SPEND_CONTRIBUTION' };
    const accountKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${next.accountId}`, SK: 'CURRENT' };
    let checkpoint: ProjectionCheckpoint;
    {
      const work = this.work();
      const stored = await work.get(checkpointKey);
      const current = stored?.data as ProjectionCheckpoint | undefined;
      const currentFingerprint = current?.fingerprint ?? current?.operation;
      const sameInput =
        currentFingerprint === fingerprint ||
        (current?.state === 'rebuilding' &&
          current.textPostingVersion === undefined &&
          currentFingerprint === legacyFingerprint);
      if (sameInput && current?.state === 'complete') return Date.now();
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
        const fact = (await work.get(financeReadKeys.fact(next.id)))?.fact as
          | FinanceFact
          | undefined;
        if (fact && (fact.accountId !== next.accountId || fact.sourceVersion > next.sourceVersion))
          throw new FinanceExperienceFailure(
            'capacity',
            'Finance projection source conflict.',
            'user',
          );
        const month = next.effectiveAt.slice(0, 7);
        let ordinal = fact?.textMonth === month ? fact.textOrdinal : undefined;
        if (ordinal === undefined) {
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
          operation,
          fingerprint,
          startedAt: Date.now(),
          offset: 0,
          calendarBasis,
          textPostingVersion: 2,
          previousTextPostingVersion: current?.textPostingVersion ?? 1,
          // Checkpoints written before calendar metadata used the default UTC basis.
          previousCalendarBasis: current?.calendarBasis ?? 'UTC',
          ...(fact ? { previous: fact } : {}),
          next: { ...next, textOrdinal: ordinal, textMonth: month },
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
      }
    }
    if (!checkpoint.next)
      throw new FinanceExperienceFailure('invariant', 'Finance publication checkpoint is incomplete.');
    next = checkpoint.next;
    const previousRefs = new Map(
      (checkpoint.previous
        ? financeFactReferences(checkpoint.previous, checkpoint.previousTextPostingVersion !== 2)
        : []
      ).map((row) => [keyId(row), row]),
    );
    // Finish an interrupted v1 publication with its original operation ordering first.
    // Changing the batch contents underneath a durable offset would skip index writes.
    const legacyPublication = checkpoint.textPostingVersion !== 2;
    const nextRefs = new Map(
      financeFactReferences(next, legacyPublication).map((row) => [keyId(row), row]),
    );
    const oldShort = new Map(
      textPostings(checkpoint.previous, checkpoint.previousTextPostingVersion === 2 ? 3 : 2).map(
        (value) => [keyId(value.key), value],
      ),
    );
    const newShort = new Map(
      textPostings(next, legacyPublication ? 2 : 3).map((value) => [keyId(value.key), value]),
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
          const included = previous
            ? textPostingOrdinals(previous, baseOrdinal).includes(entry.posting.ordinal)
            : false;
          cardinalityDelta = entry.remove ? (included ? -1 : 0) : included ? 0 : 1;
          const bits = updateTextPostingBit(
            previous ?? new Uint8Array(63),
            entry.posting.ordinal,
            !entry.remove,
          );
          if (textPostingOrdinals(bits, baseOrdinal).length)
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
          const countKey = { PK: entry.key.PK, SK: 'CARDINALITY' };
          const counter = await work.get(countKey);
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
    }
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
      ...next.slices.map((slice) => ({ slice, basis: checkpoint.calendarBasis ?? calendarBasis })),
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
    await work.put({ ...financeReadKeys.fact(next.id), fact: next });
    await work.put({
      ...textOrdinalKey(next.accountId, next.textMonth!, next.textOrdinal!),
      fact: next,
    });
    const old = checkpoint.previous;
    if (
      old?.textMonth &&
      old.textOrdinal !== undefined &&
      (old.textMonth !== next.textMonth || old.textOrdinal !== next.textOrdinal)
    )
      await work.delete(textOrdinalKey(old.accountId, old.textMonth, old.textOrdinal));
    // The canonical fact is the next publication's reversal source. Once committed,
    // the old copy is only needed by an unfinished batch, not by retained checkpoints.
    const completed = { ...checkpoint };
    delete completed.previous;
    delete completed.next;
    await work.put({ ...checkpointKey, data: { ...completed, state: 'complete' } });
    await work.put({
      ...accountKey,
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
    if (legacyPublication) return this.publishBounded(input, calendarBasis);
    return checkpoint.startedAt;
  }
}
