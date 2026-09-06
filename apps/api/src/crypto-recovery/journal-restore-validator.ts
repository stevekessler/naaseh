import { createHash } from 'node:crypto';

export interface JournalRecoveryAuditRow {
  sequence: number;
  requestId: string;
  operation: string;
  actorId: string;
  outcome: string;
  at: number;
  priorHash: string;
  hash: string;
}
const hashRow = (row: Omit<JournalRecoveryAuditRow, 'hash'>) =>
  createHash('sha256').update(JSON.stringify(row)).digest('hex');
const plaintextFields =
  /^(date|notes|generalNotes|taskReflection|suicidal|selfHarm|emotions|dbt|taskId)$/iu;
export function validateJournalRestore(input: {
  records: Array<Record<string, unknown>>;
  audit: JournalRecoveryAuditRow[];
  authorizedOwners: Set<string>;
  minimumKeyVersion: number;
}) {
  for (const record of input.records) {
    if (Object.keys(record).some((key) => plaintextFields.test(key)))
      throw new Error('Restored journal record exposes plaintext.');
    if (typeof record.ownerId !== 'string' || !input.authorizedOwners.has(record.ownerId))
      throw new Error('Restored journal record has an unauthorized owner.');
    if (typeof record.keyVersion === 'number' && record.keyVersion < input.minimumKeyVersion)
      throw new Error('Restored journal record rolls back its key version.');
  }
  for (const [index, row] of input.audit.entries()) {
    const priorHash = input.audit[index - 1]?.hash ?? 'GENESIS';
    if (
      row.priorHash !== priorHash ||
      row.hash !==
        hashRow({
          sequence: row.sequence,
          requestId: row.requestId,
          operation: row.operation,
          actorId: row.actorId,
          outcome: row.outcome,
          at: row.at,
          priorHash: row.priorHash,
        })
    )
      throw new Error('Journal recovery audit chain was altered.');
  }
  return { records: input.records.length, auditRows: input.audit.length };
}
export const journalRestoreAuditHash = hashRow;
