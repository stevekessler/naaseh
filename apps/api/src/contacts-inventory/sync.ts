import type { SyncCursor } from '@naaseh/contacts-inventory-contracts';
import { isLive, WorkspaceError, type RecordKey, type WorkspaceStore } from './repository.js';

export async function changes(
  store: WorkspaceStore,
  cursor: SyncCursor,
  limit: number,
  through?: number,
) {
  const committed = await store.checkpoint();
  if (cursor.generation !== committed.generation) throw new WorkspaceError('reset_required');
  const highWater = through ?? committed.sequence;
  if (cursor.sequence > highWater || highWater > committed.sequence)
    throw new WorkspaceError('invalid_cursor');
  const entries = await store.scanChanges(cursor.sequence, highWater, limit);
  const records = await Promise.all(
    entries.map(async (entry) => ({
      entry,
      record: await store.record(entry),
    })),
  );
  if ((await store.checkpoint()).generation !== cursor.generation)
    throw new WorkspaceError('reset_required');

  // The transaction writes one entry per sequence. A gap indicates an incomplete restore.
  if (
    entries.some((entry, index) => entry.sequence !== cursor.sequence + index + 1) ||
    records.some(({ record }) => !record) ||
    (entries.length === 0 && cursor.sequence < highWater)
  )
    throw new WorkspaceError('retry_required');

  const sequence = entries.at(-1)?.sequence ?? cursor.sequence;
  return {
    nextCursor: { generation: cursor.generation, sequence },
    hasMore: sequence < highWater,
    highWater,
    changes: records,
  };
}

export async function snapshot(
  store: WorkspaceStore,
  kind: RecordKey['kind'],
  generation: number,
  after: string | undefined,
  limit: number,
) {
  if ((await store.checkpoint()).generation !== generation)
    throw new WorkspaceError('reset_required');
  const page = await store.listRecords(kind, after, limit);
  if ((await store.checkpoint()).generation !== generation)
    throw new WorkspaceError('reset_required');
  return { items: page.records.filter(isLive), next: page.next };
}
