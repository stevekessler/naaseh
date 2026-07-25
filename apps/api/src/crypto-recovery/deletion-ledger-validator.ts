export interface RestorableRecord {
  resourceType: string;
  resourceId: string;
}

export function filterDeletedRestoreRecords<T extends RestorableRecord>(
  records: readonly T[],
  ledgerKeys: ReadonlySet<string>,
): T[] {
  return records.filter((record) => !ledgerKeys.has(`${record.resourceType}:${record.resourceId}`));
}

export function assertDeletionLedgerApplied(input: {
  restoredRecords: readonly RestorableRecord[];
  ledgerKeys: ReadonlySet<string>;
}) {
  const resurrected = input.restoredRecords.filter((record) =>
    input.ledgerKeys.has(`${record.resourceType}:${record.resourceId}`),
  );
  if (resurrected.length) throw new Error('Restore contains permanently deleted resources.');
}
