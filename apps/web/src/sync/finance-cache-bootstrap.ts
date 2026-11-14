import { db } from '../db/database.js';

/** Pending intent is not server-cache evidence and must never block an empty-cache bootstrap. */
export async function hasFinanceCacheProjections(signal?: AbortSignal): Promise<boolean> {
  signal?.throwIfAborted();
  const present = await db.transaction('r', [db.secureFinanceRecords, db.outbox], async () => {
    if (!(await db.secureFinanceRecords.count())) return false;
    const pending = new Set(
      (await db.outbox.toArray())
        .filter((mutation) => mutation.entityType.startsWith('finance'))
        .map((mutation) => mutation.entityId),
    );
    // Read keys rather than all encrypted bodies; this check never decrypts pending or cached values.
    return (await db.secureFinanceRecords.toCollection().primaryKeys()).some(
      (id) => !pending.has(id),
    );
  });
  signal?.throwIfAborted();
  return present;
}
