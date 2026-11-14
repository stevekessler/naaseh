import type { EntityType, VectorCursor } from '@naaseh/domain';
import { decryptText, encryptText, type Ciphertext } from '../crypto/vault.js';
import { db, type EncryptedFinanceRecord } from '../db/database.js';
import { applyFinancePull, financeDeviceKey } from '../db/finance-repository.js';
import {
  currentFinanceAccess,
  peekFinanceAccess,
} from '../features/finance/security/finance-access.js';

export interface FinanceDeliveryCheckpoint {
  ownerId: string;
  version: number;
  cursor: VectorCursor;
  /** Opaque server evidence, encrypted locally; never an unlock credential. */
  cacheProof?: string;
  cacheGeneration?: string;
  /** Opaque server continuation while the current-state snapshot is incomplete. */
  bootstrapCursor?: string;
  /** Exact encrypted predecessor: compare inside the data/checkpoint transaction. */
  storageValue?: string;
}
const checkpointKey = (ownerId: string) => `finance-delivery:${ownerId}`;
const associatedData = (ownerId: string, version: number) =>
  `finance:delivery:${ownerId}:v${version}`;
const invalid = () =>
  new Error('Finance synchronization checkpoint is unavailable. Reconnect and retry.');
function cursor(value: unknown): VectorCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const entries = Object.entries(value);
  if (
    entries.length > 256 ||
    entries.some(
      ([feed, sequence]) =>
        !feed ||
        feed.length > 256 ||
        ['__proto__', 'constructor', 'prototype'].includes(feed) ||
        !Number.isSafeInteger(sequence) ||
        sequence < 0,
    )
  )
    throw invalid();
  return Object.fromEntries(entries);
}
function cacheProof(value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length > 45000 ||
    !/^fc1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(value)
  )
    throw new Error('Finance cache proof is unavailable. Reconnect and refresh.');
  return value;
}

/** Known-invalid source rights block reads before discarding only cached delivery data. */
export async function invalidateFinanceDeliveryCache(ownerId: string): Promise<void> {
  requireOwner(ownerId);
  const invalidation = currentFinanceAccess().markStale({ notifySecurityChange: true });
  const results = await Promise.allSettled([
    invalidation,
    db.transaction('rw', [db.secureFinanceRecords, db.settings, db.outbox], async () => {
      // Legacy queued CSV keeps its account metadata in the encrypted staging
      // record. Preserve pending rows without tagging them as a fresh server cache.
      const pending = new Set(
        (await db.outbox.toArray())
          .filter((mutation) => mutation.entityType.startsWith('finance'))
          .map((mutation) => mutation.entityId),
      );
      const ids = await db.secureFinanceRecords.toCollection().primaryKeys();
      await db.secureFinanceRecords.bulkDelete(ids.filter((id) => !pending.has(id)));
      await db.settings.delete(checkpointKey(ownerId));
    }),
  ]);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
}

/** A task or group revocation invalidates Finance evidence after the ordinary cursor commits. */
export async function invalidateFinanceForAccessRevocation(): Promise<void> {
  const access = peekFinanceAccess();
  if (!access) return;
  try {
    const legacyViewMayBeActive = access.canRead();
    const checkpoint = await db.settings.get(checkpointKey(access.ownerId));
    if (peekFinanceAccess() !== access || (!checkpoint && !legacyViewMayBeActive)) return;
    await invalidateFinanceDeliveryCache(access.ownerId);
  } catch {
    if (peekFinanceAccess() === access)
      await access.markStale({ notifySecurityChange: true }).catch(() => undefined);
  }
}

function requireOwner(ownerId: string) {
  if (!ownerId || currentFinanceAccess().ownerId !== ownerId)
    throw new Error('Finance synchronization belongs to another account.');
}

/** Finance continuation is encrypted and independent of the ordinary task cursor. */
export async function readFinanceDeliveryCheckpoint(
  ownerId: string,
): Promise<FinanceDeliveryCheckpoint> {
  requireOwner(ownerId);
  return currentFinanceAccess().read(async () => {
    const stored = await db.settings.get(checkpointKey(ownerId));
    if (!stored) return { ownerId, version: 0, cursor: {} };
    try {
      const envelope = JSON.parse(stored.value) as { version: number; value: Ciphertext };
      if (!Number.isSafeInteger(envelope.version) || envelope.version < 1) throw invalid();
      const plaintext = await decryptText(
        envelope.value,
        await financeDeviceKey(),
        associatedData(ownerId, envelope.version),
      );
      const decoded = JSON.parse(plaintext) as {
        ownerId: string;
        cursor: unknown;
        cacheProof?: unknown;
        cacheGeneration?: unknown;
        bootstrapCursor?: unknown;
      };
      if (
        decoded.ownerId !== ownerId ||
        (decoded.cacheGeneration !== undefined &&
          (typeof decoded.cacheGeneration !== 'string' ||
            !/^[a-f0-9-]{36}$/u.test(decoded.cacheGeneration))) ||
        (decoded.bootstrapCursor !== undefined &&
          (typeof decoded.bootstrapCursor !== 'string' ||
            decoded.bootstrapCursor.length < 1 ||
            decoded.bootstrapCursor.length > 100_000))
      )
        throw invalid();
      return {
        ownerId,
        version: envelope.version,
        cursor: cursor(decoded.cursor),
        ...(decoded.cacheProof === undefined ? {} : { cacheProof: cacheProof(decoded.cacheProof) }),
        ...(decoded.cacheGeneration === undefined
          ? {}
          : { cacheGeneration: decoded.cacheGeneration as string }),
        ...(decoded.bootstrapCursor === undefined
          ? {}
          : { bootstrapCursor: decoded.bootstrapCursor as string }),
        storageValue: stored.value,
      };
    } catch {
      throw invalid();
    }
  });
}

/** Never acknowledge delivery separately from encrypted records and pending-edit protection. */
export async function commitFinanceDelivery(input: {
  previous: FinanceDeliveryCheckpoint;
  cacheProof?: string;
  bootstrapCursor?: string;
  cursor: VectorCursor;
  records: EncryptedFinanceRecord[];
  tombstones: Array<{ id: string; entityType: EntityType }>;
  signal?: AbortSignal;
}) {
  const { previous } = input;
  requireOwner(previous.ownerId);
  return currentFinanceAccess().read(async (signal) => {
    const access = currentFinanceAccess();
    if (access.requiresPin && !access.requestHeaders()['x-finance-unlock'])
      throw new Error('Connect and unlock Finance before acknowledging synchronized changes.');
    if (previous.cacheProof !== undefined && input.cacheProof === undefined)
      throw new Error('Renew Finance cache evidence before acknowledging synchronized changes.');
    const proof = input.cacheProof === undefined ? undefined : cacheProof(input.cacheProof);
    if (
      input.bootstrapCursor !== undefined &&
      (typeof input.bootstrapCursor !== 'string' ||
        input.bootstrapCursor.length < 1 ||
        input.bootstrapCursor.length > 100_000)
    )
      throw invalid();
    const generation =
      proof === undefined ? undefined : (previous.cacheGeneration ?? crypto.randomUUID());
    const next = cursor(input.cursor);
    const prior = cursor(previous.cursor);
    if (
      !Number.isSafeInteger(previous.version) ||
      previous.version < 0 ||
      !Number.isSafeInteger(previous.version + 1) ||
      Object.entries(prior).some(([feed, sequence]) => (next[feed] ?? -1) < sequence)
    )
      throw invalid();
    const version = previous.version + 1;
    const value = await encryptText(
      JSON.stringify({
        ownerId: previous.ownerId,
        cursor: next,
        ...(proof === undefined || generation === undefined
          ? {}
          : { cacheProof: proof, cacheGeneration: generation }),
        ...(input.bootstrapCursor === undefined ? {} : { bootstrapCursor: input.bootstrapCursor }),
      }),
      await financeDeviceKey(),
      associatedData(previous.ownerId, version),
    );
    const storageValue = JSON.stringify({ version, value });
    await applyFinancePull({
      records:
        generation === undefined
          ? input.records
          : input.records.map((record) => ({ ...record, cacheGeneration: generation })),
      tombstones: input.tombstones,
      signal,
      delivery: {
        ownerId: previous.ownerId,
        ...(previous.storageValue === undefined ? {} : { previousValue: previous.storageValue }),
        value: storageValue,
      },
    });
    return {
      ownerId: previous.ownerId,
      version,
      cursor: next,
      storageValue,
      ...(proof === undefined || generation === undefined
        ? {}
        : { cacheProof: proof, cacheGeneration: generation }),
      ...(input.bootstrapCursor === undefined ? {} : { bootstrapCursor: input.bootstrapCursor }),
    };
  }, input.signal);
}
