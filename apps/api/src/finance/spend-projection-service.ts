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
  shortTextPostingKey,
  textOrdinalKey,
  updateTextPostingBit,
  textPostingOrdinals,
} from './text-postings.js';
import {
  FinanceUnitOfWork,
  loadTargetedFinanceEntity,
  type FinanceRecordKey,
} from './unit-of-work.js';
import { emitFinanceExperienceEvent } from './telemetry.js';

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
  next: FinanceFact;
  state: 'rebuilding' | 'complete';
  sourceScopeRevision?: number;
};
const keyId = (key: FinanceRecordKey) => JSON.stringify([key.PK, key.SK]);
function shortPostings(fact: FinanceFact | undefined) {
  if (!fact || fact.textOrdinal === undefined || !fact.textMonth) return [];
  return financeTextGrams(financeFactSearchText(fact), 1, 2).map((gram) => ({
    key: shortTextPostingKey(fact.accountId, gram, fact.textMonth!, fact.textOrdinal!),
    ordinal: fact.textOrdinal!,
    month: fact.textMonth!,
  }));
}

/** Restartable index publication; account coverage stays rebuilding until every reference/summary commits. */
export class SpendProjectionService {
  constructor(private readonly work: () => FinanceUnitOfWork = () => new FinanceUnitOfWork()) {}
  async publish(next: FinanceFact, calendarBasis = 'UTC'): Promise<void> {
    const started = performance.now();
    const correlationId = createUlid();
    try {
      await this.publishBounded(next, calendarBasis);
      emitFinanceExperienceEvent({
        operation: 'projection',
        outcome: 'success',
        correlationId,
        durationMs: performance.now() - started,
      });
    } catch (error) {
      emitFinanceExperienceEvent({
        operation: 'projection',
        outcome: 'failed',
        correlationId,
        durationMs: performance.now() - started,
        errorCategory: 'storage',
        retryKind: 'automatic',
      });
      throw error;
    }
  }

  private async publishBounded(next: FinanceFact, calendarBasis: string): Promise<void> {
    const operation = createHash('sha256')
      .update(JSON.stringify({ next, calendarBasis }))
      .digest('hex');
    const checkpointKey = { PK: `FINANCE#TRANSACTION#${next.id}`, SK: 'SPEND_CONTRIBUTION' };
    const accountKey = { PK: `FINANCE#PROJECTION_ACCOUNT#${next.accountId}`, SK: 'CURRENT' };
    let checkpoint: ProjectionCheckpoint;
    {
      const work = this.work();
      const stored = await work.get(checkpointKey);
      const current = stored?.data as ProjectionCheckpoint | undefined;
      if (current?.operation === operation && current.state === 'complete') return;
      if (current?.state === 'rebuilding' && current.operation !== operation)
        throw new Error('Finance projection publication already in progress.');
      const marker = await work.get(accountKey);
      if (marker?.state === 'rebuilding' && marker.operation !== operation)
        throw new Error('Finance account projection is rebuilding.');
      if (current?.operation === operation) checkpoint = current;
      else {
        const fact = (await work.get(financeReadKeys.fact(next.id)))?.fact as
          | FinanceFact
          | undefined;
        if (fact && (fact.accountId !== next.accountId || fact.sourceVersion > next.sourceVersion))
          throw new Error('Finance projection source conflict.');
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
            throw new Error('Finance text ordinal capacity exceeded.');
          await work.put({ ...counterKey, nextOrdinal: ordinal + 1 });
        }
        checkpoint = {
          operation,
          offset: 0,
          ...(fact ? { previous: fact } : {}),
          next: { ...next, textOrdinal: ordinal, textMonth: month },
          state: 'rebuilding',
        };
        const account = await loadTargetedFinanceEntity(work, 'accounts', next.accountId);
        if (account) checkpoint.sourceScopeRevision = account.scopeRevision;
        if (Buffer.byteLength(JSON.stringify(checkpoint), 'utf8') > 300_000)
          throw new Error('Finance projection checkpoint exceeds safe item budget.');
        await work.put({ ...checkpointKey, data: checkpoint });
        await work.put({
          ...accountKey,
          state: 'rebuilding',
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
    next = checkpoint.next;
    const previousRefs = new Map(
      (checkpoint.previous ? financeFactReferences(checkpoint.previous) : []).map((row) => [
        keyId(row),
        row,
      ]),
    );
    const nextRefs = new Map(financeFactReferences(next).map((row) => [keyId(row), row]));
    const oldShort = new Map(
      shortPostings(checkpoint.previous).map((value) => [keyId(value.key), value]),
    );
    const newShort = new Map(shortPostings(next).map((value) => [keyId(value.key), value]));
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
        throw new Error('Finance projection checkpoint changed.');
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
              codec: 'short-text-v1',
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
          const facts = addMinorUnits([Number(counter?.facts ?? 0), cardinalityDelta]);
          if (facts < 0) throw new Error('Finance index cardinality invariant failed.');
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
      throw new Error('Finance projection publication conflict.');
    if (current.state === 'complete') return;
    const deltas = [
      ...(checkpoint.previous?.slices ?? []).map((slice) => ({
        ...slice,
        amountMinor: -slice.amountMinor,
      })),
      ...next.slices,
    ];
    const monthly = new Map<
      string,
      { key: FinanceRecordKey; amount: number; currency: string; currencyExponent: number }
    >();
    for (const slice of deltas) {
      const month = localFinanceDate(slice.effectiveAt, calendarBasis).slice(0, 7);
      const key = {
        PK: `FINANCE#SUMMARY#${slice.accountId}#${slice.currency}`,
        SK: `MONTH#${calendarBasis}#${month}`,
      };
      const id = keyId(key);
      const previous = monthly.get(id);
      monthly.set(id, {
        key,
        amount: addMinorUnits([previous?.amount ?? 0, slice.amountMinor]),
        currency: slice.currency,
        currencyExponent: slice.currencyExponent,
      });
    }
    for (const { key, amount, currency, currencyExponent } of monthly.values()) {
      const row = await work.get(key);
      if (row && row.currencyExponent !== currencyExponent)
        throw new Error('Finance summary currency invariant failed.');
      await work.put({
        ...key,
        currency,
        currencyExponent,
        amountMinor: addMinorUnits([Number(row?.amountMinor ?? 0), amount]),
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
    await work.put({ ...checkpointKey, data: { ...checkpoint, state: 'complete' } });
    await work.put({
      ...accountKey,
      state: 'ready',
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
  }
}
