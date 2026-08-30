import { createHash, randomUUID } from 'node:crypto';

export type JournalRecoveryState =
  | 'requested'
  | 'rewrapped'
  | 'consumed'
  | 'completed'
  | 'cancelled'
  | 'expired'
  | 'denied';
export interface JournalRecoveryRecord {
  id: string;
  ownerId: string;
  state: JournalRecoveryState;
  sessionEpochDigest: string;
  keyEnvelopeVersion: number;
  recoveryKeyVersion: number;
  ephemeralPublicKeySpki: string;
  ephemeralPublicKeyDigest: string;
  reasonDigest: string;
  idempotencyKey: string;
  expiresAt: number;
  adminId?: string;
  approvalId?: string;
  resultCiphertext?: string;
  consumedAt?: number;
}
interface AuditRow {
  sequence: number;
  requestId: string;
  operation: string;
  actorId: string;
  outcome: string;
  at: number;
  priorHash: string;
  hash: string;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const hashAudit = (row: Omit<AuditRow, 'hash'>) => digest(JSON.stringify(row));

export class InMemoryJournalRecoveryRepository {
  private requests = new Map<string, JournalRecoveryRecord>();
  private idempotency = new Map<string, string>();
  private audit: AuditRow[] = [];
  create(input: Omit<JournalRecoveryRecord, 'id'>) {
    const existing = this.idempotency.get(`${input.ownerId}:${input.idempotencyKey}`);
    if (existing) return this.requests.get(existing)!;
    const record = { ...input, id: randomUUID() };
    this.requests.set(record.id, record);
    this.idempotency.set(`${input.ownerId}:${input.idempotencyKey}`, record.id);
    return record;
  }
  get(id: string) {
    return this.requests.get(id);
  }
  save(record: JournalRecoveryRecord) {
    this.requests.set(record.id, record);
    return record;
  }
  appendAudit(requestId: string, operation: string, actorId: string, outcome: string, at: number) {
    const priorHash = this.audit.at(-1)?.hash ?? 'GENESIS';
    const base = {
      sequence: this.audit.length + 1,
      requestId,
      operation,
      actorId,
      outcome,
      at,
      priorHash,
    };
    this.audit.push({ ...base, hash: hashAudit(base) });
  }
  auditChainValid() {
    return this.audit.every(
      (row, index) =>
        row.priorHash === (this.audit[index - 1]?.hash ?? 'GENESIS') &&
        row.hash ===
          hashAudit({
            sequence: row.sequence,
            requestId: row.requestId,
            operation: row.operation,
            actorId: row.actorId,
            outcome: row.outcome,
            at: row.at,
            priorHash: row.priorHash,
          }),
    );
  }
}
export const journalRecoveryDigest = digest;
