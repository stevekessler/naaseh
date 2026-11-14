import { hasFinanceCacheProjections } from './finance-cache-bootstrap.js';
import { financeRequest, FinanceClientError } from '../features/finance/finance-client.js';
import {
  currentFinanceAccess,
  peekFinanceAccess,
} from '../features/finance/security/finance-access.js';
import type { FinanceAccessController } from '../features/finance/security/finance-access-controller.js';
import {
  maintainFinanceCache,
  readFinanceCachedData,
  withFinanceCacheLease,
} from './finance-cache-access.js';
import {
  commitFinanceDelivery,
  invalidateFinanceDeliveryCache,
  readFinanceDeliveryCheckpoint,
} from './finance-delivery.js';

export interface FinanceApiSnapshot<T> {
  readonly token: unique symbol;
  readonly __value?: T;
}
export type FinanceSnapshotRequest = <T>(path: `/finance/${string}`) => Promise<T>;
interface SnapshotContext {
  access: FinanceAccessController;
  generation: string;
  value: unknown;
  release: () => void;
}
const snapshots = new WeakMap<FinanceApiSnapshot<unknown>, SnapshotContext>();
const refresh = () => new Error('Refresh Finance before using this retained snapshot.');
const usableProof = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 4000 &&
  /^fc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value);

export function disposeFinanceApiSnapshot<T>(snapshot: FinanceApiSnapshot<T>): void {
  const context = snapshots.get(snapshot);
  snapshots.delete(snapshot);
  context?.release();
}

/** Collect data only inside load; publish it through a subsequent verified read of the token. */
export async function loadFinanceApiSnapshot<T>(
  load: (request: FinanceSnapshotRequest) => Promise<T>,
): Promise<FinanceApiSnapshot<T>> {
  const access = currentFinanceAccess();
  let created: FinanceApiSnapshot<T> | undefined;
  try {
    return await maintainFinanceCache(async (signal) => {
      const previous = await readFinanceDeliveryCheckpoint(access.ownerId);
      if (
        (!previous.cacheProof || !previous.cacheGeneration) &&
        (await hasFinanceCacheProjections(signal))
      ) {
        await invalidateFinanceDeliveryCache(access.ownerId);
        throw refresh();
      }
      const proofs = previous.cacheProof ? [previous.cacheProof] : [];
      let received = 0;
      const request: FinanceSnapshotRequest = <V>(path: `/finance/${string}`) =>
        financeRequest<V>(
          path,
          {
            signal,
            headers: { 'x-finance-cache-protocol': '1' },
          },
          async (input, options) => {
            const response = await fetch(input, options);
            if (response.ok) {
              const proof = response.headers.get('x-finance-cache-proof');
              if (!usableProof(proof) || proofs.length >= 64) throw refresh();
              proofs.push(proof);
              received++;
            }
            return response;
          },
        );
      const value = await load(request);
      if (!received) throw refresh();
      const result = await financeRequest<{ financeCache?: { status?: string; proof?: string } }>(
        '/sync/pull',
        {
          method: 'POST',
          signal,
          body: JSON.stringify({
            contractVersion: 8,
            financeCacheProtocol: 1,
            financeCacheOnly: true,
            financeCursor: previous.cursor,
            financeCacheProof: proofs,
          }),
        },
      );
      if (result.financeCache?.status === 'refresh-required') {
        await invalidateFinanceDeliveryCache(access.ownerId);
        throw refresh();
      }
      if (
        result.financeCache?.status !== 'current' ||
        typeof result.financeCache.proof !== 'string'
      ) {
        await access.markStale();
        throw refresh();
      }
      const checkpoint = await commitFinanceDelivery({
        previous,
        cursor: previous.cursor,
        cacheProof: result.financeCache.proof,
        records: [],
        tombstones: [],
        signal,
      });
      if (!checkpoint.cacheGeneration) throw refresh();
      signal.throwIfAborted();
      created = Object.freeze({}) as FinanceApiSnapshot<T>;
      const snapshot = created;
      const release = access.onLock(() => disposeFinanceApiSnapshot(snapshot));
      snapshots.set(snapshot, { access, generation: checkpoint.cacheGeneration, value, release });
      return snapshot;
    });
  } catch (error) {
    if (created) disposeFinanceApiSnapshot(created);
    if (
      error instanceof FinanceClientError &&
      [401, 403, 404, 409].includes(error.problem.status) &&
      peekFinanceAccess() === access
    )
      await invalidateFinanceDeliveryCache(access.ownerId);
    throw error;
  }
}

/** Readers must return their result; publishing inside the callback bypasses its final check. */
export async function readFinanceApiSnapshot<T, R>(
  snapshot: FinanceApiSnapshot<T>,
  operation: (value: T) => R | Promise<R>,
): Promise<R> {
  const context = snapshots.get(snapshot);
  if (!context || context.access !== currentFinanceAccess()) throw refresh();
  const result = await context.access.read(() =>
    readFinanceCachedData((lease) =>
      withFinanceCacheLease(lease, async (generation) => {
        if (snapshots.get(snapshot) !== context || context.generation !== generation)
          throw refresh();
        const value = await operation(context.value as T);
        if (snapshots.get(snapshot) !== context) throw refresh();
        return value;
      }),
    ),
  );
  if (snapshots.get(snapshot) !== context) throw refresh();
  return result;
}

/** Derive a retained view only after both ingredients pass one complete current-source lease. */
export async function combineFinanceApiSnapshots<A, B, R>(
  first: FinanceApiSnapshot<A>,
  second: FinanceApiSnapshot<B>,
  combine: (first: A, second: B) => R | Promise<R>,
): Promise<FinanceApiSnapshot<R>> {
  const left = snapshots.get(first),
    right = snapshots.get(second);
  if (
    !left ||
    !right ||
    left.access !== currentFinanceAccess() ||
    left.access !== right.access ||
    left.generation !== right.generation
  )
    throw refresh();
  const check = () => {
    if (snapshots.get(first) !== left || snapshots.get(second) !== right) throw refresh();
  };
  const value = await left.access.read(() =>
    readFinanceCachedData((lease) =>
      withFinanceCacheLease(lease, async (generation) => {
        check();
        if (left.generation !== generation) throw refresh();
        const value = await combine(left.value as A, right.value as B);
        check();
        return value;
      }),
    ),
  );
  check();
  const snapshot = Object.freeze({}) as FinanceApiSnapshot<R>;
  const release = left.access.onLock(() => disposeFinanceApiSnapshot(snapshot));
  snapshots.set(snapshot, { access: left.access, generation: left.generation, value, release });
  return snapshot;
}
