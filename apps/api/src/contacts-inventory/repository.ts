import { createHash } from 'node:crypto';
import type { SyncCursor, Tombstone, WorkspaceRecord } from '@naaseh/contacts-inventory-contracts';

export type RecordKey = Pick<WorkspaceRecord, 'kind' | 'id'>;
export type StoredRecord = WorkspaceRecord | Tombstone;
export type ChangeEntry = RecordKey & { sequence: number };
export type DeletionEntry = Tombstone & { generation: number };

type Json = WorkspaceRecord['fields'][string];
export type RecordMutation = RecordKey & {
  actor: string;
  generation: number;
  mutationId: string;
} & (
    | { action: 'create'; fields: WorkspaceRecord['fields'] }
    | { action: 'update'; revision: number; fields: WorkspaceRecord['fields'] }
    | { action: 'delete'; revision: number }
  );
type Outcome = RecordKey & {
  revision: number;
  lastChangeSequence: number;
  action: RecordMutation['action'];
};
export type Receipt = {
  actor: string;
  mutationId: string;
  digest: string;
  outcome: Outcome;
};
export type Commit = {
  expected: SyncCursor;
  record: StoredRecord;
  receipt: Receipt;
  entry: ChangeEntry;
  ledger?: DeletionEntry;
};
export interface WorkspaceStore {
  checkpoint(): Promise<SyncCursor>;
  record(key: RecordKey): Promise<StoredRecord | undefined>;
  receipt(actor: string, mutationId: string): Promise<Receipt | undefined>;
  scanChanges(after: number, through: number, limit: number): Promise<ChangeEntry[]>;
  listRecords(
    kind: RecordKey['kind'],
    after: string | undefined,
    limit: number,
  ): Promise<{ records: StoredRecord[]; next: string | undefined }>;
  commit(input: Commit): Promise<boolean>;
}

export class WorkspaceError extends Error {
  constructor(
    readonly code:
      | 'reset_required'
      | 'revision_conflict'
      | 'idempotency_conflict'
      | 'retry_required'
      | 'invalid_cursor',
    readonly current?: StoredRecord,
  ) {
    super(code);
  }
}

export function isLive(record: StoredRecord | undefined): record is WorkspaceRecord {
  return record !== undefined && !('deleted' in record);
}

function canonical(value: Json): Json {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key]!)]),
  );
}

export class WorkspaceRepository {
  constructor(
    readonly store: WorkspaceStore,
    private readonly now = () => new Date().toISOString(),
  ) {}

  async read(key: RecordKey) {
    const record = await this.store.record(key);
    return isLive(record) ? record : null;
  }

  async mutate(mutation: RecordMutation) {
    const { kind, id, action, actor, mutationId, generation } = mutation;
    const key = { kind, id };
    const digest = createHash('sha256')
      .update(JSON.stringify(canonical(mutation)))
      .digest('hex');

    for (let attempt = 0; attempt < 6; attempt++) {
      const expected = await this.store.checkpoint();
      if (expected.generation !== generation) throw new WorkspaceError('reset_required');
      const prior = await this.store.receipt(actor, mutationId);
      const current = await this.store.record(key);
      if (prior) {
        if (digest !== prior.digest) throw new WorkspaceError('idempotency_conflict');
        if ((await this.store.checkpoint()).generation !== generation)
          throw new WorkspaceError('reset_required');
        return { ...prior.outcome, replayed: true, deleted: !isLive(current) };
      }
      if (
        action === 'create'
          ? current !== undefined
          : !isLive(current) || current.revision !== mutation.revision
      ) {
        // Re-read the checkpoint before returning a conflict observed across two reads.
        const latest = await this.store.checkpoint();
        if (latest.generation !== generation) throw new WorkspaceError('reset_required');
        if (latest.sequence !== expected.sequence) continue;
        throw new WorkspaceError('revision_conflict', current);
      }

      const revision = (current?.revision ?? 0) + 1;
      const sequence = expected.sequence + 1;
      const identity = { ...key, revision, lastChangeSequence: sequence };
      const outcome = { ...identity, action };
      const now = this.now();
      const record: StoredRecord =
        action === 'delete'
          ? {
              ...identity,
              deleted: true,
              ...(kind === 'item' ? { imageGeneration: (current?.imageGeneration ?? 0) + 1 } : {}),
            }
          : {
              ...identity,
              ...(kind === 'item' && isLive(current) && current.imageGeneration !== undefined
                ? {
                    imageGeneration: current.imageGeneration,
                    ...(current.image ? { image: current.image } : {}),
                  }
                : {}),
              fields: mutation.fields,
              createdAt: isLive(current) ? current.createdAt : now,
              updatedAt: now,
            };
      if (
        await this.store.commit({
          expected,
          record,
          receipt: { actor, mutationId, digest, outcome },
          entry: { ...key, sequence },
          ...('deleted' in record ? { ledger: { ...record, generation } } : {}),
        })
      )
        return { ...outcome, replayed: false, deleted: action === 'delete' };
    }
    throw new WorkspaceError('retry_required');
  }
}
