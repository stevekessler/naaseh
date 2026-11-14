import { hasFinanceCacheProjections } from './finance-cache-bootstrap.js';
import { currentFinanceAccess } from '../features/finance/security/finance-access.js';
import type { FinanceAccessController } from '../features/finance/security/finance-access-controller.js';
import { financeRequest } from '../features/finance/finance-client.js';
import {
  readFinanceDeliveryCheckpoint,
  commitFinanceDelivery,
  invalidateFinanceDeliveryCache,
  type FinanceDeliveryCheckpoint,
} from './finance-delivery.js';

export interface FinanceCacheLease {
  readonly token: unique symbol;
}
const leases = new WeakMap<
  FinanceCacheLease,
  { access: FinanceAccessController; signal: AbortSignal; generation: string }
>();
const refresh = () =>
  new Error('Connect and refresh saved Finance records before using this cache.');
const online = () => typeof navigator === 'undefined' || navigator.onLine;

/** A lease is scoped to this batch and its original visit; persisting a proof never grants access. */
export function withFinanceCacheLease<T>(
  lease: FinanceCacheLease,
  operation: (generation: string) => Promise<T>,
): Promise<T> {
  const context = leases.get(lease);
  if (!context || context.access !== currentFinanceAccess() || context.signal.aborted)
    return Promise.reject(refresh());
  return context.access.read(() => operation(context.generation), context.signal);
}
async function checkOnline(
  previous: FinanceDeliveryCheckpoint,
  signal: AbortSignal,
): Promise<FinanceDeliveryCheckpoint> {
  const response = await financeRequest<{ financeCache?: { status?: string; proof?: string } }>(
    '/sync/pull',
    {
      method: 'POST',
      signal,
      body: JSON.stringify({
        contractVersion: 8,
        financeCacheProtocol: 1,
        financeCacheOnly: true,
        financeCursor: previous.cursor,
        ...(previous.cacheProof ? { financeCacheProof: previous.cacheProof } : {}),
      }),
    },
  );
  if (response.financeCache?.status === 'refresh-required') {
    await invalidateFinanceDeliveryCache(previous.ownerId);
    throw refresh();
  }
  if (
    response.financeCache?.status !== 'current' ||
    typeof response.financeCache.proof !== 'string'
  ) {
    await currentFinanceAccess().markStale();
    throw refresh();
  }
  // This verifies existing cache only: never acknowledge any Finance or ordinary feed progress.
  return commitFinanceDelivery({
    previous,
    cursor: previous.cursor,
    records: [],
    tombstones: [],
    cacheProof: response.financeCache.proof,
    signal,
  });
}

interface CacheMaintenance {
  kind: 'maintenance';
  closed: true;
  finished: Promise<void>;
}
interface CacheReadBatch {
  kind: 'read';
  access: FinanceAccessController;
  signal: AbortSignal;
  ready: Promise<FinanceDeliveryCheckpoint>;
  finished: Promise<void>;
  readers: number;
  closed: boolean;
  leave: () => void;
}
const batches = new WeakMap<FinanceAccessController, CacheReadBatch | CacheMaintenance>();

/** Serialize incoming delivery with complete before/read/after cache batches in this tab. */
export async function maintainFinanceCache<T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const access = currentFinanceAccess();
  return access.read(async (signal) => {
    const previous = batches.get(access);
    let release!: () => void;
    const entry: CacheMaintenance = {
      kind: 'maintenance',
      closed: true,
      finished: new Promise<void>((resolve) => {
        release = resolve;
      }),
    };
    batches.set(access, entry);
    try {
      await previous?.finished.catch(() => undefined);
      return await access.read(operation, signal);
    } finally {
      release();
      if (batches.get(access) === entry) batches.delete(access);
    }
  });
}
async function prepare(access: FinanceAccessController, signal: AbortSignal) {
  return access.read(async () => {
    let checkpoint = await readFinanceDeliveryCheckpoint(access.ownerId);
    if (!checkpoint.cacheProof || !checkpoint.cacheGeneration) {
      if (!online()) throw refresh();
      if (await hasFinanceCacheProjections(signal)) {
        await invalidateFinanceDeliveryCache(access.ownerId);
        throw refresh();
      }
    }
    if (online()) checkpoint = await checkOnline(checkpoint, signal);
    if (!checkpoint.cacheProof || !checkpoint.cacheGeneration) throw refresh();
    return checkpoint;
  }, signal);
}
function joinBatch(access: FinanceAccessController, signal: AbortSignal): CacheReadBatch {
  const previous = batches.get(access);
  if (previous?.kind === 'read' && !previous.closed && !previous.signal.aborted) {
    previous.readers++;
    return previous;
  }
  let complete!: () => void, fail!: (error: unknown) => void;
  const finished = new Promise<void>((resolve, reject) => {
    complete = resolve;
    fail = reject;
  });
  // A failed participant still awaits this result; suppress early unhandled-rejection reporting.
  void finished.catch(() => undefined);
  const batch: CacheReadBatch = {
    kind: 'read',
    access,
    signal,
    readers: 1,
    closed: false,
    finished,
    // Serialize closed batches so a final check cannot race the next batch's checkpoint CAS.
    ready: (previous ? previous.finished.catch(() => undefined) : Promise.resolve()).then(() =>
      prepare(access, signal),
    ),
    leave: () => {
      if (--batch.readers) return;
      batch.closed = true;
      void batch.ready
        .then(async (checkpoint) => {
          if (online()) await checkOnline(checkpoint, signal);
        })
        .then(complete, fail)
        .finally(() => {
          if (batches.get(access) === batch) batches.delete(access);
        });
    },
  };
  batches.set(access, batch);
  return batch;
}

/** Return data from this promise; never publish plaintext from inside the callback. */
export async function readFinanceCachedData<T>(
  operation: (lease: FinanceCacheLease) => Promise<T>,
): Promise<T> {
  const access = currentFinanceAccess();
  return access.read(async (signal) => {
    const batch = joinBatch(access, signal);
    let lease: FinanceCacheLease | undefined;
    let result: T | undefined,
      error: unknown,
      failed = false;
    try {
      const checkpoint = await batch.ready;
      if (!checkpoint.cacheGeneration) throw refresh();
      lease = Object.freeze({}) as FinanceCacheLease;
      leases.set(lease, { access, signal: batch.signal, generation: checkpoint.cacheGeneration });
      result = await operation(lease);
    } catch (cause) {
      failed = true;
      error = cause;
    } finally {
      if (lease) leases.delete(lease);
      batch.leave();
    }
    await batch.finished;
    if (failed) throw error;
    return result as T;
  });
}
