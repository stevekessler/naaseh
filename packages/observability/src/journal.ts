export const JOURNAL_EVENT_NAMESPACE = 'journal' as const;
export const journalEvents = [
  'journal.enroll',
  'journal.unlock',
  'journal.lock',
  'journal.save',
  'journal.sync',
  'journal.list',
  'journal.filter',
  'journal.open',
  'journal.dashboard',
  'journal.recovery',
] as const;

export const journalEventFields = [
  'correlationId',
  'operation',
  'outcome',
  'latencyBucket',
  'schemaVersion',
  'keyVersion',
  'retryKind',
  'conflictKind',
  'count',
] as const;
const journalEventFieldSet = new Set<string>(journalEventFields);
export function sanitizeJournalEvent(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(([key]) => journalEventFieldSet.has(key)),
  );
}
export const journalMetricNames = [
  'JournalOperationCount',
  'JournalOperationFailure',
  'JournalConflictCount',
  'JournalRecoveryDenied',
  'JournalRecoveryExpired',
] as const;
export const journalAuditControls = {
  hashChained: true,
  kmsSignedManifest: true,
  cloudTrailRecoveryDecryptEvidence: true,
  logRetentionDays: 90,
  expectedCost: 'existing logs plus low-cardinality metrics and rare recovery KMS requests',
} as const;
