import { maintainFinanceCache } from './finance-cache-access.js';
import { ulidSchema, type EntityType } from '@naaseh/domain';
import { hasFinanceCacheProjections } from './finance-cache-bootstrap.js';
import { encryptFinanceRecord, financeDeviceKey } from '../db/finance-repository.js';
import { FinanceClientError, financeRequest } from '../features/finance/finance-client.js';
import { peekFinanceAccess } from '../features/finance/security/finance-access.js';
import {
  commitFinanceDelivery,
  invalidateFinanceDeliveryCache,
  readFinanceDeliveryCheckpoint,
} from './finance-delivery.js';

// Unknown future types must remain unacknowledged until this client understands their cache shape.
const entities = new Set<string>([
  'financeAccount',
  'financeBalanceSnapshot',
  'financeTransaction',
  'financeAllocation',
  'financeTransfer',
  'financeCategory',
  'financeMerchant',
  'financeBudget',
  'financeBudgetAccountLink',
  'financeBudgetItem',
  'financeReusableItem',
  'financeTransactionMatch',
  'financeReconciliation',
  'financeTaskLink',
  'financeReviewIssue',
  'financeUpcomingExpense',
  'financeFulfillment',
  'financeReceipt',
  'financeDashboardPreference',
  'financeRefundRelationship',
]);
const invalid = () => new Error('Finance synchronization needs a fresh authorized response.');
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  return value as Record<string, unknown>;
};
const integer = (value: unknown): value is number =>
  Number.isSafeInteger(value) && Number(value) >= 1;
function row(value: unknown, ownerId: string) {
  const change = object(value);
  const payload = change.operation === 'upsert' ? object(change.payload) : undefined;
  const csvIdentity =
    change.entityType === 'financeTransaction' && typeof change.entityId === 'string'
      ? /^([0-9A-HJKMNP-TV-Z]{26}):([1-9][0-9]{0,4})$/u.exec(change.entityId)
      : null;
  const legacyCsv =
    csvIdentity &&
    Number(csvIdentity[2]) <= 50000 &&
    (change.operation === 'tombstone' ||
      (payload?.origin === 'csv' &&
        payload.csvImportBatchId === csvIdentity[1] &&
        payload.csvRowOrdinal === Number(csvIdentity[2])));

  const immutable =
    change.entityType === 'financeBalanceSnapshot' || change.entityType === 'financeReconciliation';
  const validId =
    ulidSchema.safeParse(change.entityId).success ||
    legacyCsv ||
    (change.entityType === 'financeBalanceSnapshot' &&
      typeof change.entityId === 'string' &&
      change.entityId.endsWith('-opening') &&
      ulidSchema.safeParse(change.entityId.slice(0, -8)).success);
  if (
    typeof change.entityType !== 'string' ||
    !entities.has(change.entityType) ||
    !validId ||
    (immutable && change.version !== 1) ||
    !integer(change.version) ||
    !integer(change.sequence) ||
    typeof change.changedAt !== 'string' ||
    !Number.isFinite(Date.parse(change.changedAt)) ||
    typeof change.audience !== 'string' ||
    !['upsert', 'tombstone'].includes(String(change.operation))
  )
    throw invalid();
  const catalog = ['financeCategory', 'financeMerchant'].includes(change.entityType);
  if (
    change.audience !== `OWNER#${ownerId}` &&
    !(
      change.audience.startsWith('GROUP#') && ulidSchema.safeParse(change.audience.slice(6)).success
    ) &&
    !(catalog && change.audience === 'PUBLIC')
  )
    throw invalid();
  if (
    payload &&
    (payload.id !== change.entityId ||
      (payload.version !== change.version && !(immutable && payload.version === undefined)))
  )
    throw invalid();
  return {
    id: change.entityId as string,
    entityType: change.entityType as EntityType,
    scopeKey: change.audience === 'PUBLIC' ? 'CATALOG' : change.audience,
    version: change.version,
    updatedAt: change.changedAt,
    operation: change.operation,
    ...(payload ? { payload } : {}),
  };
}

function bootstrapRow(value: unknown, ownerId: string) {
  const source = object(value);
  const payload = object(source.value);
  const scopeKey = source.scopeKey;
  const immutable = ['financeBalanceSnapshot', 'financeReconciliation'].includes(
    String(source.entityType),
  );
  const validId =
    ulidSchema.safeParse(source.entityId).success ||
    (source.entityType === 'financeBalanceSnapshot' &&
      typeof source.entityId === 'string' &&
      source.entityId.endsWith('-opening') &&
      ulidSchema.safeParse(source.entityId.slice(0, -8)).success);
  if (
    typeof source.entityType !== 'string' ||
    !entities.has(source.entityType) ||
    !validId ||
    !integer(source.version) ||
    (immutable && source.version !== 1) ||
    typeof scopeKey !== 'string' ||
    (scopeKey !== 'CATALOG' &&
      scopeKey !== `OWNER#${ownerId}` &&
      !(scopeKey.startsWith('GROUP#') && ulidSchema.safeParse(scopeKey.slice(6)).success)) ||
    typeof source.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(source.updatedAt)) ||
    payload.id !== source.entityId ||
    (payload.version !== source.version && !(immutable && payload.version === undefined))
  )
    throw invalid();
  return {
    id: source.entityId as string,
    entityType: source.entityType as EntityType,
    scopeKey,
    version: source.version as number,
    updatedAt: source.updatedAt,
    payload,
  };
}

async function pullFinanceBootstrapPage(
  previous: Awaited<ReturnType<typeof readFinanceDeliveryCheckpoint>>,
  signal: AbortSignal,
) {
  const access = peekFinanceAccess();
  if (!access) throw invalid();
  let response: Record<string, unknown>;
  try {
    response = object(
      await financeRequest<unknown>('/sync/pull', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          contractVersion: 8,
          financeCacheProtocol: 1,
          financeBootstrapProtocol: 1,
          ...(previous.bootstrapCursor ? { financeBootstrapCursor: previous.bootstrapCursor } : {}),
          ...(previous.cacheProof ? { financeCacheProof: previous.cacheProof } : {}),
        }),
      }),
    );
  } catch (error) {
    if (
      error instanceof FinanceClientError &&
      [
        'invalid_finance_bootstrap_cursor',
        'finance_bootstrap_restart_required',
        'finance_cache_refresh_required',
      ].includes(error.problem.code)
    )
      await invalidateFinanceDeliveryCache(access.ownerId);
    throw error;
  }
  const evidence = object(response.financeCache);
  if (
    response.financeState !== 'ready' ||
    evidence.status !== 'current' ||
    typeof evidence.proof !== 'string'
  ) {
    if (response.financeState === 'locked' || evidence.status === 'locked')
      await access.markStale();
    throw invalid();
  }
  const bootstrap = object(response.financeBootstrap);
  if (
    !Array.isArray(bootstrap.records) ||
    typeof bootstrap.complete !== 'boolean' ||
    (!bootstrap.complete && (typeof bootstrap.nextCursor !== 'string' || !bootstrap.nextCursor)) ||
    (bootstrap.complete && bootstrap.nextCursor !== undefined)
  )
    throw invalid();
  const frontier = object(bootstrap.frontier);
  if (
    Object.values(frontier).some(
      (sequence) => !Number.isSafeInteger(sequence) || Number(sequence) < 0,
    )
  )
    throw invalid();
  const rows = bootstrap.records.map((record) => bootstrapRow(record, access.ownerId));
  if (new Set(rows.map(({ id }) => id)).size !== rows.length) throw invalid();
  const key = await financeDeviceKey();
  const records = await Promise.all(
    rows.map(({ payload, ...record }) =>
      encryptFinanceRecord({
        ...record,
        value: payload,
        key,
        ...(typeof payload.accountId === 'string' ? { accountId: payload.accountId } : {}),
        ...(typeof payload.budgetId === 'string' ? { budgetId: payload.budgetId } : {}),
        ...(typeof payload.occurredAt === 'string' ? { occurredAt: payload.occurredAt } : {}),
        ...(typeof payload.status === 'string' ? { lifecycle: payload.status } : {}),
      }),
    ),
  );
  signal.throwIfAborted();
  await commitFinanceDelivery({
    previous,
    records,
    tombstones: [],
    cursor: bootstrap.complete ? (frontier as Record<string, number>) : previous.cursor,
    cacheProof: evidence.proof,
    ...(bootstrap.complete ? {} : { bootstrapCursor: bootstrap.nextCursor as string }),
    signal,
  });
  return { committed: true, hasMore: true };
}

/** One bounded page; records and its protected cursor commit together on the original visit. */
async function pullFinancePage(): Promise<{ committed: boolean; hasMore: boolean | undefined }> {
  const access = peekFinanceAccess();
  if (
    !access?.canRead() ||
    !navigator.onLine ||
    (access.requiresPin && !access.requestHeaders()['x-finance-unlock'])
  )
    return { committed: false, hasMore: undefined };
  return maintainFinanceCache(async (signal) => {
    const previous = await readFinanceDeliveryCheckpoint(access.ownerId);
    if (previous.bootstrapCursor || !previous.cacheProof || !previous.cacheGeneration) {
      if (!previous.bootstrapCursor && (await hasFinanceCacheProjections(signal))) {
        await invalidateFinanceDeliveryCache(access.ownerId);
        throw invalid();
      }
      return pullFinanceBootstrapPage(previous, signal);
    }
    const response = object(
      await financeRequest<unknown>('/sync/pull', {
        method: 'POST',
        signal,
        body: JSON.stringify({
          contractVersion: 8,
          financeCacheProtocol: 1,
          // Reuse the same feed page for both server lanes; ordinary progress is never committed here.
          cursor: previous.cursor,
          financeCursor: previous.cursor,
          ...(previous.cacheProof ? { financeCacheProof: previous.cacheProof } : {}),
        }),
      }),
    );
    const evidence = object(response.financeCache);
    if (evidence.status === 'refresh-required') {
      await invalidateFinanceDeliveryCache(access.ownerId);
      throw invalid();
    }
    if (
      response.financeState === 'locked' ||
      response.financeState === 'upgrade-required' ||
      evidence.status === 'locked'
    ) {
      await access.markStale();
      throw invalid();
    }
    if (
      response.financeState !== 'ready' ||
      evidence.status !== 'current' ||
      typeof evidence.proof !== 'string' ||
      !Array.isArray(response.financeChanges)
    )
      throw invalid();
    const next = object(response.financeCursor);
    if (
      (response.financeHasMore !== undefined && typeof response.financeHasMore !== 'boolean') ||
      Object.values(next).some((value) => !Number.isSafeInteger(value) || Number(value) < 0) ||
      Object.entries(previous.cursor).some(
        ([feed, sequence]) => Number(next[feed] ?? -1) < sequence,
      ) ||
      (response.financeHasMore === true &&
        !Object.entries(next).some(
          ([feed, sequence]) => Number(sequence) > (previous.cursor[feed] ?? 0),
        ))
    )
      throw invalid();
    const changes = response.financeChanges.map((change) => row(change, access.ownerId));
    if (new Set(changes.map((change) => change.id)).size !== changes.length) throw invalid();
    const key = await financeDeviceKey();
    const records = [];
    const tombstones: Array<{ id: string; entityType: EntityType }> = [];
    for (const change of changes) {
      if (change.operation === 'tombstone')
        tombstones.push({ id: change.id, entityType: change.entityType });
      else {
        const data = change.payload!;
        records.push(
          await encryptFinanceRecord({
            id: change.id,
            entityType: change.entityType,
            scopeKey: change.scopeKey,
            version: change.version,
            updatedAt: change.updatedAt,
            value: data,
            key,
            ...(typeof data.accountId === 'string' ? { accountId: data.accountId } : {}),
            ...(typeof data.budgetId === 'string' ? { budgetId: data.budgetId } : {}),
            ...(typeof data.occurredAt === 'string' ? { occurredAt: data.occurredAt } : {}),
            ...(typeof data.status === 'string' ? { lifecycle: data.status } : {}),
          }),
        );
      }
    }
    signal.throwIfAborted();
    await commitFinanceDelivery({
      previous,
      records,
      tombstones,
      cursor: next as Record<string, number>,
      cacheProof: evidence.proof,
      signal,
    });
    return { committed: true, hasMore: response.financeHasMore as boolean | undefined };
  });
}

/** Retained single-page entry point for callers that own their scheduling. */
export async function pullFinanceChanges(): Promise<boolean> {
  return (await pullFinancePage()).committed;
}

/** A bounded foreground burst; every page uses its own committed protected checkpoint. */
export async function catchUpFinanceChanges(): Promise<{
  pages: number;
  hasMore: boolean | undefined;
}> {
  const access = peekFinanceAccess();
  if (
    !access?.canRead() ||
    !navigator.onLine ||
    (access.requiresPin && !access.requestHeaders()['x-finance-unlock'])
  )
    return { pages: 0, hasMore: undefined };
  return access.read(async (signal) => {
    let pages = 0;
    while (pages < 5) {
      signal.throwIfAborted();
      if (peekFinanceAccess() !== access) throw invalid();
      const page = await pullFinancePage();
      signal.throwIfAborted();
      if (!page.committed) return { pages, hasMore: undefined };
      pages++;
      if (page.hasMore !== true) return { pages, hasMore: page.hasMore };
    }
    return { pages, hasMore: true };
  });
}
