import type {
  ChangeEntry,
  Commit,
  DeletionEntry,
  Receipt,
  RecordKey,
  StoredRecord,
  WorkspaceStore,
} from '../../apps/api/src/contacts-inventory/repository.js';

const key = ({ kind, id }: RecordKey) => `${kind}/${id}`;

export class MemoryWorkspaceStore implements WorkspaceStore {
  state = { generation: 1, sequence: 0 };
  private records = new Map<string, StoredRecord>();
  private receipts = new Map<string, Receipt>();
  entries: ChangeEntry[] = [];
  ledger: DeletionEntry[] = [];

  async checkpoint() {
    return { ...this.state };
  }
  async record(ref: RecordKey) {
    return this.records.get(key(ref));
  }
  async receipt(actor: string, mutationId: string) {
    return this.receipts.get(JSON.stringify([actor, mutationId]));
  }
  async scanChanges(after: number, through: number, limit: number) {
    return this.entries
      .filter(({ sequence }) => sequence > after && sequence <= through)
      .slice(0, limit);
  }
  async listRecords(kind: RecordKey['kind'], after: string | undefined, limit: number) {
    const matches = [...this.records.values()]
      .filter((row) => row.kind === kind && (!after || row.id > after))
      .sort((a, b) => a.id.localeCompare(b.id));
    const records = matches.slice(0, limit);
    return { records, next: matches.length > limit ? records.at(-1)?.id : undefined };
  }
  async commit({ expected, receipt, record, entry, ledger }: Commit) {
    if (this.state.sequence !== expected.sequence || this.state.generation !== expected.generation)
      return false;
    const receiptKey = JSON.stringify([receipt.actor, receipt.mutationId]);
    if (this.receipts.has(receiptKey)) return false;
    this.records.set(key(record), record);
    this.receipts.set(receiptKey, receipt);
    this.entries.push(entry);
    if (ledger) this.ledger.push(ledger);
    this.state.sequence = entry.sequence;
    return true;
  }
}
