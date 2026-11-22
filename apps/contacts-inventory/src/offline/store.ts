import Dexie, { type Table } from 'dexie';
import {
  contactTypeSchema,
  locationSchema,
  strengthUnitSchema,
  featureDatabaseName,
  featureDatabaseSchema,
  featureDatabaseVersion,
  type ContactType,
  type InventoryLocation,
  type FeatureHost,
  type SyncCursor,
  type Tombstone,
  type WorkspaceRecord,
} from '@naaseh/contacts-inventory-contracts';

export type Projection = WorkspaceRecord | Tombstone;
export type Draft = {
  kind: Projection['kind'];
  id: string;
  generation: number;
  mutationId: string;
  action: 'create' | 'update' | 'delete';
  revision?: number;
  fields?: WorkspaceRecord['fields'];
};
type Status = 'pending' | 'conflict' | 'deleted' | 'reset_required';
type EncryptedRecord = {
  account: string;
  key: string;
  sequence: number;
  ciphertext?: string;
};
export type QueueRow = {
  order: number;
  account: string;
  target: string;
  slot: string;
  status: Status;
  ciphertext?: string;
};
type SyncRow = SyncCursor & {
  account: string;
  contactTypes?: string;
  locations?: string;
  strengthUnits?: string;
};

export class OfflineWorkspace {
  private readonly db = new Dexie(featureDatabaseName);
  private readonly records: Table<EncryptedRecord, [string, string]>;
  private readonly outbox: Table<QueueRow, number, Omit<QueueRow, 'order'>>;
  private readonly sync: Table<SyncRow, string>;
  private readonly account: string;

  constructor(private readonly host: Pick<FeatureHost, 'userId' | 'encrypt' | 'decrypt'>) {
    this.account = host.userId;
    this.db.version(featureDatabaseVersion).stores(featureDatabaseSchema);
    this.records = this.db.table('records');
    this.outbox = this.db.table('outbox');
    this.sync = this.db.table('sync');
  }

  private async key(kind: Projection['kind'], id: string) {
    const input = new TextEncoder().encode(JSON.stringify([this.account, kind, id]));
    const digest = await crypto.subtle.digest('SHA-256', input);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }

  async queue(draft: Draft) {
    const target = await this.key(draft.kind, draft.id);
    const slot = `draft:${draft.mutationId}`;
    const ciphertext = await this.host.encrypt(slot, JSON.stringify(draft));
    return this.db.transaction('rw', this.sync, this.records, this.outbox, async () => {
      const latest = await this.sync.get(this.account);
      const record = await this.records.get([this.account, target]);
      if (latest?.generation !== draft.generation)
        throw new Error('Refresh the workspace before saving this change.');
      if (record && !record.ciphertext) throw new Error('This record has been deleted.');
      return this.outbox.add({
        account: this.account,
        target,
        slot,
        ciphertext,
        status: 'pending',
      });
    });
  }

  async contactTypes() {
    const state = await this.sync.get(this.account);
    if (!state?.contactTypes) return [];
    const decoded: unknown = JSON.parse(
      await this.host.decrypt('contact-types', state.contactTypes),
    );
    return contactTypeSchema.array().parse(decoded);
  }

  async cacheContactTypes(types: ContactType[]) {
    const encrypted = await this.host.encrypt('contact-types', JSON.stringify(types));
    await this.sync.update(this.account, { contactTypes: encrypted });
  }

  async locations() {
    const state = await this.sync.get(this.account);
    if (!state?.locations) return [];
    const decoded: unknown = JSON.parse(await this.host.decrypt('locations', state.locations));
    return locationSchema.array().parse(decoded);
  }

  async cacheLocations(locations: InventoryLocation[]) {
    const encrypted = await this.host.encrypt('locations', JSON.stringify(locations));
    await this.sync.update(this.account, { locations: encrypted });
  }

  async strengthUnits() {
    const state = await this.sync.get(this.account);
    if (!state?.strengthUnits) return [];
    const decoded: unknown = JSON.parse(
      await this.host.decrypt('strength-units', state.strengthUnits),
    );
    return strengthUnitSchema.array().parse(decoded);
  }

  async cacheStrengthUnits(units: ContactType[]) {
    const encrypted = await this.host.encrypt('strength-units', JSON.stringify(units));
    await this.sync.update(this.account, { strengthUnits: encrypted });
  }

  async draftStatus() {
    const rows = await this.outbox.where('account').equals(this.account).sortBy('order');
    const drafts = await Promise.all(
      rows.filter((row) => row.status === 'pending').map((row) => this.decode(row)),
    );
    return { drafts, conflicts: rows.length - drafts.length };
  }

  async cursor() {
    const row = await this.sync.get(this.account);
    return row ? { generation: row.generation, sequence: row.sequence } : undefined;
  }

  async pending() {
    const queue = await this.outbox.where('account').equals(this.account).sortBy('order');
    const unresolved = queue.findIndex(
      (row) => row.status === 'conflict' || row.status === 'reset_required',
    );
    const ready = unresolved === -1 ? queue : queue.slice(0, unresolved);
    return ready.filter((row) => row.status === 'pending' && row.ciphertext);
  }

  async decode(item: QueueRow): Promise<Draft> {
    if (item.account !== this.account || !item.ciphertext)
      throw new Error('This draft is unavailable.');
    return JSON.parse(await this.host.decrypt(item.slot, item.ciphertext)) as Draft;
  }

  async acknowledge(item: QueueRow) {
    await this.outbox
      .where('order')
      .equals(item.order)
      .and(
        (row) =>
          row.account === this.account &&
          row.status === 'pending' &&
          row.ciphertext === item.ciphertext,
      )
      .delete();
  }

  async fail(item: QueueRow, status: Exclude<Status, 'pending'>) {
    await this.outbox
      .where('order')
      .equals(item.order)
      .and(
        (row) =>
          row.account === this.account &&
          row.status === 'pending' &&
          row.ciphertext === item.ciphertext,
      )
      .modify((row) => {
        row.status = status;
        if (status === 'deleted') delete row.ciphertext;
      });
  }

  async read() {
    const rows = await this.records.where('account').equals(this.account).toArray();
    return Promise.all(
      rows
        .filter((row) => row.ciphertext)
        .map(
          async (row) =>
            JSON.parse(
              await this.host.decrypt(`record:${row.key}`, row.ciphertext!),
            ) as WorkspaceRecord,
        ),
    );
  }

  async apply(
    expected: SyncCursor | undefined,
    next: SyncCursor,
    projections: Projection[],
    replace = false,
  ) {
    const rows = await Promise.all(
      projections.map(async (record): Promise<EncryptedRecord> => {
        const key = await this.key(record.kind, record.id);
        return {
          account: this.account,
          key,
          sequence: record.lastChangeSequence,
          ...('deleted' in record
            ? {}
            : {
                ciphertext: await this.host.encrypt(`record:${key}`, JSON.stringify(record)),
              }),
        };
      }),
    );
    return this.db.transaction('rw', this.records, this.outbox, this.sync, async () => {
      const current = await this.sync.get(this.account);
      if (current?.generation !== expected?.generation || current?.sequence !== expected?.sequence)
        return false;
      if (
        !replace &&
        (!current || current.generation !== next.generation || next.sequence < current.sequence)
      )
        return false;
      if (replace) {
        // A restored workspace can roll back live versions. Deletion reconciliation
        // remains authoritative, while drafts require explicit review in the new generation.
        const prior = await this.records.where('account').equals(this.account).toArray();
        const present = new Set(rows.map((row) => row.key));
        for (const row of prior) {
          if (present.has(row.key)) continue;
          rows.push({ account: row.account, key: row.key, sequence: next.sequence });
        }
        await this.records.where('account').equals(this.account).delete();
        if (current && current.generation !== next.generation)
          await this.outbox
            .where('account')
            .equals(this.account)
            .and((row) => row.status === 'pending')
            .modify({ status: 'reset_required' });
      }
      for (const row of rows) {
        const known = await this.records.get([row.account, row.key]);
        if (known && (known.sequence >= row.sequence || !known.ciphertext)) continue;
        await this.records.put(row);
        if (!row.ciphertext) {
          await this.outbox
            .where('[account+target]')
            .equals([this.account, row.key])
            .modify((draft) => {
              draft.status = 'deleted';
              delete draft.ciphertext;
            });
        }
      }
      await this.sync.put({
        ...next,
        account: this.account,
        ...(current?.generation === next.generation && current.contactTypes
          ? { contactTypes: current.contactTypes }
          : {}),
        ...(current?.generation === next.generation && current.locations
          ? { locations: current.locations }
          : {}),
        ...(current?.generation === next.generation && current.strengthUnits
          ? { strengthUnits: current.strengthUnits }
          : {}),
      });
      return true;
    });
  }

  close() {
    this.db.close();
  }
}
